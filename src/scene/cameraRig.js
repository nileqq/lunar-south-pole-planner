// Smooth "fly to object" + follow-the-object camera, on top of OrbitControls.
import * as THREE from 'three';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class CameraRig {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.focus = null; // { obj, ... }
    this.anim = null;
    this.lastPos = new THREE.Vector3();
    this._v = new THREE.Vector3();
  }

  /**
   * Fly to `target` (an object descriptor from solarSystem.objects).
   * `dir` is the viewing direction from the object toward the camera.
   */
  flyTo(target, { distance, dir, duration = 1.8, minDistance }) {
    const objPos = target.anchor.getWorldPosition(new THREE.Vector3());
    this.anim = {
      t: 0,
      duration,
      fromCam: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      distance,
      dir, // Vector3, or function() -> Vector3 (evaluated every frame)
    };
    this.focus = target;
    this.lastPos.copy(objPos);
    if (target.center) this.lastCenter = target.center.getWorldPosition(new THREE.Vector3());
    this.controls.enabled = false;
    this.controls.minDistance = minDistance ?? distance * 0.3;
  }

  /** Fly to a free point (no object to follow). */
  flyToPoint(point, camPos, duration = 1.8) {
    this.anim = { t: 0, duration, fromCam: this.camera.position.clone(), fromTarget: this.controls.target.clone(), point: point.clone(), camPos: camPos.clone() };
    this.focus = null;
    this.controls.enabled = false;
    this.controls.minDistance = 0.01;
  }

  isAnimating() { return !!this.anim; }

  update(dt) {
    const { camera, controls } = this;
    let objPos = null;
    if (this.focus) objPos = this.focus.anchor.getWorldPosition(this._v);

    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / a.duration);
      const e = ease(a.t);
      const endTarget = objPos ? objPos.clone() : a.point;
      const dir = typeof a.dir === 'function' ? a.dir() : a.dir;
      const endCam = objPos ? objPos.clone().addScaledVector(dir.clone().normalize(), a.distance) : a.camPos;

      // Look toward the destination early, then glide in.
      controls.target.lerpVectors(a.fromTarget, endTarget, ease(Math.min(1, a.t * 2.2)));
      // Camera rides a shrinking sphere around the destination. Its radius is interpolated
      // in log space, which feels natural across huge scale ranges.
      const fromOff = a.fromCam.clone().sub(endTarget);
      const toOff = endCam.clone().sub(endTarget);
      const fromLen = Math.max(fromOff.length(), 1e-6), toLen = Math.max(toOff.length(), 1e-6);
      const len = Math.exp(Math.log(fromLen) + (Math.log(toLen) - Math.log(fromLen)) * e);
      const dirv = fromOff.normalize().lerp(toOff.normalize(), e);
      if (dirv.lengthSq() < 1e-8) dirv.copy(toOff);
      camera.position.copy(endTarget).addScaledVector(dirv.normalize(), len);

      if (a.t >= 1) {
        this.anim = null;
        controls.enabled = true;
      }
    } else if (objPos && this.focus.center) {
      // Surface point: rotate the camera with the body's spin and carry it along its orbit.
      const center = this.focus.center.getWorldPosition(new THREE.Vector3());
      const oldRel = this.lastPos.clone().sub(this.lastCenter).normalize();
      const newRel = objPos.clone().sub(center).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(oldRel, newRel);
      const camOff = camera.position.clone().sub(this.lastCenter).applyQuaternion(q);
      camera.position.copy(center).add(camOff);
      controls.target.copy(objPos);
      camera.up.set(0, 1, 0);
    } else if (objPos) {
      // Follow: carry the camera along with the moving object.
      const delta = objPos.clone().sub(this.lastPos);
      camera.position.add(delta);
      controls.target.add(delta);
    }
    if (objPos) this.lastPos.copy(objPos);
    if (this.focus?.center) this.lastCenter = this.focus.center.getWorldPosition(new THREE.Vector3());
    if (!this.anim) controls.update();
    camera.lookAt(controls.target);
  }
}
