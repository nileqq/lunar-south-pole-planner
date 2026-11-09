import * as THREE from 'three';
import { createEarthTextures, createMoonTextures, radialGlow } from './textures.js';
import { daysSinceJ2000, earthLongitude, moonLongitude } from '../sim/astro.js';
import { TEST_STATION, LUNAR_SITE } from '../data/catalog.js';

const RAD = Math.PI / 180;

// Two scale modes. "visual" makes everything visible at once; "real" keeps true ratios
// (units: Earth radii).
export const SCALES = {
  visual: { sunR: 14, earthR: 3.2, moonR: 0.9, earthOrbit: 120, moonOrbit: 12 },
  real: { sunR: 109.2, earthR: 1, moonR: 0.2727, earthOrbit: 23481, moonOrbit: 60.27 },
};

const LOGDEPTH_VERT_PARS = '#include <common>\n#include <logdepthbuf_pars_vertex>\n';
const LOGDEPTH_FRAG_PARS = '#include <logdepthbuf_pars_fragment>\n';

const NOISE_GLSL = `
float hash(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y), f.z); }
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a*vnoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

function makeSun() {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `${LOGDEPTH_VERT_PARS}
      varying vec3 vPos; varying vec3 vNormalW; varying vec3 vWorld;
      void main(){
        vPos = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `${LOGDEPTH_FRAG_PARS}
      uniform float uTime; varying vec3 vPos; varying vec3 vNormalW; varying vec3 vWorld;
      ${NOISE_GLSL}
      void main(){
        #include <logdepthbuf_fragment>
        vec3 p = normalize(vPos) * 3.0;
        float n = fbm(p + vec3(uTime*0.04, uTime*0.025, 0.0));
        float g = fbm(p * 5.0 - vec3(0.0, uTime*0.07, uTime*0.03));
        float t = n * 0.55 + g * 0.45;
        vec3 col = mix(vec3(1.0, 0.36, 0.05), vec3(1.0, 0.86, 0.45), smoothstep(0.32, 0.72, t));
        float mu = clamp(dot(normalize(vNormalW), normalize(cameraPosition - vWorld)), 0.0, 1.0);
        col *= 0.5 + 0.5 * pow(mu, 0.45);
        gl_FragColor = vec4(col * 1.35, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), material);

  const glowNear = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialGlow([[0, 'rgba(255,230,170,0.95)'], [0.18, 'rgba(255,180,80,0.55)'], [0.45, 'rgba(255,120,30,0.12)'], [1, 'rgba(255,100,20,0)']]),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  glowNear.scale.setScalar(6);
  const glowFar = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialGlow([[0, 'rgba(255,200,120,0.35)'], [0.3, 'rgba(255,150,60,0.08)'], [1, 'rgba(255,120,40,0)']]),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  glowFar.scale.setScalar(22);
  glowNear.raycast = glowFar.raycast = () => {};
  mesh.add(glowNear, glowFar);
  return { mesh, material };
}

function makeAtmosphere() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1.035, 64, 48),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `${LOGDEPTH_VERT_PARS}
        varying vec3 vNormalW; varying vec3 vWorld;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz; vNormalW = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `${LOGDEPTH_FRAG_PARS}
        varying vec3 vNormalW; varying vec3 vWorld;
        void main(){
          #include <logdepthbuf_fragment>
          vec3 N = normalize(vNormalW);
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);
          float day = smoothstep(-0.3, 0.45, dot(N, normalize(-vWorld)));
          vec3 c = vec3(0.32, 0.62, 1.0) * fres * day * 1.6;
          gl_FragColor = vec4(c, fres * day);
        }`,
    }),
  );
}

function makeMarker(color) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = color; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 12, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, 16, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthWrite: false, transparent: true }));
  sprite.scale.setScalar(0.016);
  sprite.renderOrder = 10;
  return sprite;
}

function latLonToLocal(latDeg, lonDeg, r = 1) {
  const lat = latDeg * RAD, lon = lonDeg * RAD;
  return new THREE.Vector3(-Math.cos(lat) * Math.cos(lon) * r, Math.sin(lat) * r, Math.cos(lat) * Math.sin(lon) * r);
}

function makeOrbit(color, opacity) {
  const pts = [];
  for (let i = 0; i < 512; i++) { const a = (i / 512) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a), 0, -Math.sin(a))); }
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  line.raycast = () => {};
  return line;
}

function makeStars() {
  const group = new THREE.Group();
  const dot = radialGlow([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']], 64);
  const palette = [[0.75, 0.83, 1], [0.92, 0.95, 1], [1, 1, 1], [1, 0.95, 0.82], [1, 0.82, 0.62]];
  // Galactic plane, tilted ~60° to the ecliptic.
  const galN = new THREE.Vector3(0, Math.cos(1.05), Math.sin(1.05));
  const layers = [[9000, 1.4, 0.7], [1600, 2.4, 0.9], [180, 3.6, 1]];
  let seed = 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const [count, size, bright] of layers) {
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      if (v.lengthSq() > 1 || v.lengthSq() < 1e-4) { i--; continue; }
      v.normalize();
      if (rand() < 0.45) { // pull toward the galactic band
        const d = v.dot(galN);
        v.addScaledVector(galN, -d * (0.85 + rand() * 0.1)).normalize();
      }
      v.multiplyScalar(1e5);
      pos.set([v.x, v.y, v.z], i * 3);
      const c = palette[Math.floor(rand() * palette.length)];
      const b = bright * (0.35 + 0.65 * rand() ** 2);
      col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({
      size, sizeAttenuation: false, vertexColors: true, map: dot, transparent: true, depthWrite: false,
    }));
    pts.raycast = () => {};
    group.add(pts);
  }
  return group;
}

export function createSolarSystem(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.1));
  const sunLight = new THREE.PointLight(0xfff4e0, 3.2, 0, 0);
  scene.add(sunLight);

  const stars = makeStars();
  scene.add(stars);

  // Sun
  const sun = makeSun();
  scene.add(sun.mesh);

  // Earth: group(position) → scale → tilt → spin → surface
  const earthTex = createEarthTextures();
  const earthGroup = new THREE.Group();
  const earthScale = new THREE.Group();
  const earthTilt = new THREE.Group();
  earthTilt.rotation.x = -23.44 * RAD;
  const earthSpin = new THREE.Group();
  const earthMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    new THREE.MeshStandardMaterial({ map: earthTex.map, roughnessMap: earthTex.roughnessMap, roughness: 1, metalness: 0 }),
  );
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.012, 96, 64),
    new THREE.MeshStandardMaterial({ map: earthTex.clouds, transparent: true, depthWrite: false, roughness: 1 }),
  );
  clouds.raycast = () => {};
  const atmosphere = makeAtmosphere();
  atmosphere.raycast = () => {};
  const stationMarker = makeMarker('#5aa9ff');
  stationMarker.position.copy(latLonToLocal(TEST_STATION.lat, TEST_STATION.lon, 1.01));
  earthSpin.add(earthMesh, clouds, stationMarker);
  earthTilt.add(earthSpin);
  earthScale.add(earthTilt, atmosphere);
  earthGroup.add(earthScale);
  scene.add(earthGroup);

  // Moon
  const moonTex = createMoonTextures();
  const moonGroup = new THREE.Group();
  const moonScale = new THREE.Group();
  const moonSpin = new THREE.Group();
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    new THREE.MeshStandardMaterial({ map: moonTex.map, bumpMap: moonTex.bump, bumpScale: 2.2, roughness: 1, metalness: 0 }),
  );
  const poleMarker = makeMarker('#f5a524');
  poleMarker.position.copy(latLonToLocal(LUNAR_SITE.lat, LUNAR_SITE.lon, 1.01));
  moonSpin.add(moonMesh, poleMarker);
  moonScale.add(moonSpin);
  moonGroup.add(moonScale);
  scene.add(moonGroup);

  // Orbits
  const earthOrbit = makeOrbit(0x5aa9ff, 0.28);
  const moonOrbit = makeOrbit(0xc9ced8, 0.3);
  scene.add(earthOrbit, moonOrbit);

  let scale = SCALES.visual;

  const objects = {
    sun: { anchor: sun.mesh, pick: [sun.mesh], radius: () => scale.sunR },
    earth: { anchor: earthGroup, pick: [earthMesh], radius: () => scale.earthR },
    moon: { anchor: moonGroup, pick: [moonMesh], radius: () => scale.moonR },
    station: { anchor: stationMarker, pick: [stationMarker], radius: () => scale.earthR, parent: 'earth', center: earthGroup },
    southpole: { anchor: poleMarker, pick: [poleMarker], radius: () => scale.moonR, parent: 'moon', center: moonGroup },
  };

  const tmp = new THREE.Vector3();

  function update(simMs, mode, elapsed, camera) {
    scale = SCALES[mode];
    const d = daysSinceJ2000(simMs);
    const LE = earthLongitude(d);
    const LM = moonLongitude(d);

    sun.mesh.scale.setScalar(scale.sunR);
    sun.material.uniforms.uTime.value = elapsed;

    earthGroup.position.set(Math.cos(LE), 0, -Math.sin(LE)).multiplyScalar(scale.earthOrbit);
    earthScale.scale.setScalar(scale.earthR);
    // Spin chosen so local solar time at every longitude matches UTC.
    const sunAngle = LE + Math.PI;
    const utcFrac = (((simMs % 86400000) + 86400000) % 86400000) / 86400000;
    earthSpin.rotation.y = sunAngle + utcFrac * Math.PI * 2;
    clouds.rotation.y = elapsed * 0.004;

    moonGroup.position.set(Math.cos(LM), 0, -Math.sin(LM)).multiplyScalar(scale.moonOrbit).add(earthGroup.position);
    moonScale.scale.setScalar(scale.moonR);
    moonSpin.rotation.y = LM + Math.PI; // tidally locked: same face toward Earth

    earthOrbit.scale.setScalar(scale.earthOrbit);
    moonOrbit.position.copy(earthGroup.position);
    moonOrbit.scale.setScalar(scale.moonOrbit);

    // Stars sit "at infinity": always centred on the camera.
    stars.position.copy(camera.position);

    // Markers only make sense up close.
    const near = (obj, parentGroup, r) => camera.position.distanceTo(parentGroup.getWorldPosition(tmp)) < r * 40;
    stationMarker.visible = near(stationMarker, earthGroup, scale.earthR);
    poleMarker.visible = near(poleMarker, moonGroup, scale.moonR);
  }

  return { objects, update, getScale: () => scale };
}
