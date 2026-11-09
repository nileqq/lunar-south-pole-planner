// Procedural planet textures, generated once at startup (no image downloads needed).
import * as THREE from 'three';

function makeNoise(seed = 1) {
  const hash = (x, y, z) => {
    let n = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(seed, 2246822519)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  };
  const fade = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  function noise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
    return lerp(
      lerp(lerp(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), lerp(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
      lerp(lerp(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), lerp(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v),
      w,
    );
  }
  function fbm(x, y, z, oct = 5) {
    let a = 0.5, f = 1, s = 0, norm = 0;
    for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f, z * f); norm += a; a *= 0.5; f *= 2.03; }
    return s / norm;
  }
  return { noise, fbm };
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function percentile(arr, p) {
  const sample = [];
  for (let i = 0; i < arr.length; i += 37) sample.push(arr[i]);
  sample.sort((a, b) => a - b);
  return sample[Math.floor(sample.length * p)];
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (c1, c2, t) => [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];

function canvasTexture(W, H, fill, srgb = true) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  fill(img.data);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Iterate the sphere: (x,y) pixel -> unit vector. Matches THREE.SphereGeometry UVs.
function forSphere(W, H, fn) {
  for (let y = 0; y < H; y++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * 2 * Math.PI;
      fn(x, y, -cl * Math.cos(lon), sl, cl * Math.sin(lon), lat);
    }
  }
}

export function createEarthTextures(W = 1024, H = 512) {
  const { fbm } = makeNoise(7);
  const { fbm: moist } = makeNoise(21);
  const elev = new Float32Array(W * H);
  forSphere(W, H, (x, y, px, py, pz) => {
    const w = fbm(px * 1.4 + 9, py * 1.4, pz * 1.4, 3);
    elev[y * W + x] = fbm(px * 1.7 + w * 0.9, py * 1.7 + w * 0.9, pz * 1.7 - w * 0.5, 6);
  });
  const sea = percentile(elev, 0.66);
  const peak = percentile(elev, 0.985);

  const deep = [8, 30, 66], shallow = [28, 92, 150];
  const forest = [38, 78, 40], grass = [96, 128, 62], desert = [196, 168, 112], rock = [120, 104, 86], ice = [236, 242, 248];

  const color = new Uint8ClampedArray(W * H * 4);
  const rough = new Uint8ClampedArray(W * H * 4);
  forSphere(W, H, (x, y, px, py, pz, lat) => {
    const i = y * W + x;
    const e = elev[i];
    const absLat = Math.abs(lat) / (Math.PI / 2);
    const m = moist(px * 3, py * 3, pz * 3, 4);
    let c, r;
    if (e < sea) {
      c = mix(deep, shallow, smooth(sea - 0.12, sea, e));
      r = 115;
    } else {
      const h = smooth(sea, peak, e);
      const dry = smooth(0.55, 0.38, m) * smooth(0.55, 0.2, absLat);
      c = mix(mix(forest, grass, smooth(0.4, 0.62, m + absLat * 0.3)), desert, dry);
      c = mix(c, rock, smooth(0.45, 0.9, h));
      r = 240;
    }
    const iceEdge = 0.78 + (m - 0.5) * 0.25;
    if (absLat > iceEdge) { c = mix(c, ice, smooth(iceEdge, iceEdge + 0.05, absLat)); r = 200; }
    color[i * 4] = c[0]; color[i * 4 + 1] = c[1]; color[i * 4 + 2] = c[2]; color[i * 4 + 3] = 255;
    rough[i * 4] = r; rough[i * 4 + 1] = r; rough[i * 4 + 2] = r; rough[i * 4 + 3] = 255;
  });

  const { fbm: cl } = makeNoise(99);
  const clouds = new Uint8ClampedArray(W * H * 4);
  forSphere(W, H, (x, y, px, py, pz, lat) => {
    const i = y * W + x;
    const band = 0.5 + 0.5 * Math.cos(lat * 6);
    const n = cl(px * 2.5, py * 5, pz * 2.5, 5);
    const a = smooth(0.53, 0.74, n * (0.85 + 0.25 * band));
    clouds[i * 4] = 255; clouds[i * 4 + 1] = 255; clouds[i * 4 + 2] = 255; clouds[i * 4 + 3] = a * 210;
  });

  return {
    map: canvasTexture(W, H, (d) => d.set(color)),
    roughnessMap: canvasTexture(W, H, (d) => d.set(rough), false),
    clouds: canvasTexture(W, H, (d) => d.set(clouds)),
  };
}

export function createMoonTextures(W = 1024, H = 512) {
  const { fbm } = makeNoise(3);
  const height = new Float32Array(W * H);
  const albedo = new Float32Array(W * H);
  forSphere(W, H, (x, y, px, py, pz) => {
    const i = y * W + x;
    const maria = fbm(px * 1.1 + 4, py * 1.1, pz * 1.1, 4);
    albedo[i] = maria;
    height[i] = (fbm(px * 6, py * 6, pz * 6, 5) - 0.5) * 0.35;
  });
  const mariaCut = percentile(albedo, 0.7);
  for (let i = 0; i < W * H; i++) {
    const dark = smooth(mariaCut - 0.03, mariaCut + 0.05, albedo[i]);
    albedo[i] = 0.62 - dark * 0.26 + height[i] * 0.4;
    height[i] -= dark * 0.08;
  }

  // Craters: power-law sizes, more small ones than big ones.
  const rand = rng(42);
  const N = 1400;
  for (let k = 0; k < N; k++) {
    const lon0 = rand() * 2 * Math.PI;
    const lat0 = Math.asin(rand() * 2 - 1);
    const r = 0.006 + 0.11 * Math.pow(rand(), 7);
    const fresh = rand() < 0.12;
    const c0x = -Math.cos(lat0) * Math.cos(lon0), c0y = Math.sin(lat0), c0z = Math.cos(lat0) * Math.sin(lon0);
    const reach = r * (fresh ? 2.6 : 1.5);
    const y0 = Math.max(0, Math.floor((0.5 - (lat0 + reach) / Math.PI) * H));
    const y1 = Math.min(H - 1, Math.ceil((0.5 - (lat0 - reach) / Math.PI) * H));
    for (let y = y0; y <= y1; y++) {
      const lat = (0.5 - (y + 0.5) / H) * Math.PI;
      const cl = Math.cos(lat), sl = Math.sin(lat);
      const half = reach / Math.max(cl, 0.02);
      const fullRow = half >= Math.PI;
      const span = Math.ceil((half / (2 * Math.PI)) * W);
      const xc = Math.round((lon0 / (2 * Math.PI)) * W);
      const n = fullRow ? W : 2 * span + 1;
      for (let j = 0; j < n; j++) {
        const x = fullRow ? j : (((xc - span + j) % W) + W) % W;
        const lon = ((x + 0.5) / W) * 2 * Math.PI;
        const dot = -cl * Math.cos(lon) * c0x + sl * c0y + cl * Math.sin(lon) * c0z;
        const q = Math.acos(Math.min(1, dot)) / r;
        if (q > reach / r) continue;
        const i = y * W + x;
        if (q < 1) {
          height[i] -= 0.5 * r * 6 * (1 - q * q);
          albedo[i] -= 0.05 * (1 - q);
        }
        height[i] += 0.18 * r * 6 * Math.exp(-(((q - 1) / 0.18) ** 2));
        if (fresh && q > 0.9) albedo[i] += 0.12 * Math.exp(-(q - 1) * 1.6);
      }
    }
  }

  let hMin = Infinity, hMax = -Infinity;
  for (let i = 0; i < W * H; i++) { hMin = Math.min(hMin, height[i]); hMax = Math.max(hMax, height[i]); }
  const map = canvasTexture(W, H, (d) => {
    for (let i = 0; i < W * H; i++) {
      const v = Math.max(0, Math.min(1, albedo[i])) * 255;
      d[i * 4] = v; d[i * 4 + 1] = v * 0.98; d[i * 4 + 2] = v * 0.95; d[i * 4 + 3] = 255;
    }
  });
  const bump = canvasTexture(W, H, (d) => {
    for (let i = 0; i < W * H; i++) {
      const v = ((height[i] - hMin) / (hMax - hMin)) * 255;
      d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
  }, false);
  return { map, bump };
}

export function radialGlow(stops, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
