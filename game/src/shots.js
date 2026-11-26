// shots.js — deterministic scenes for screenshots and demos. Opening the
// game with ?shot=takeoff|rings|cruise|landing parks the plane in a set
// pose on the matching mission, with the autopilot holding it there, so a
// headless browser renders the same frame every time. ?shot=title shows
// the title over the parked plane. Without the parameter, nothing here
// runs and the game plays normally.

import { levelAt } from './world.js';

const POSES = {
  takeoff: {
    level: 0,
    plane: { x: 0, alt: 0, z: 210, speed: 27, heading: 0, pitch: 3, roll: 0, throttle: 0.92, airborne: false },
    hold: { alt: 0, speed: 27 },
  },
  rings: {
    level: 0,
    plane: { x: -70, alt: 268, z: 3350, speed: 52, heading: 2, pitch: 2, roll: -8, throttle: 0.74, airborne: true },
    hold: { alt: 268, speed: 52 },
  },
  cruise: {
    level: 0,
    plane: { x: 60, alt: 480, z: 5600, speed: 57, heading: -4, pitch: 1, roll: 6, throttle: 0.78, airborne: true },
    hold: { alt: 480, speed: 57 },
  },
  landing: {
    level: 0,
    plane: { x: 6, alt: 74, z: 11150, speed: 33, heading: 0, pitch: -3, roll: 0, throttle: 0.3, airborne: true },
    hold: { alt: 74, speed: 33 },
  },
};

export function shotPose() {
  const params = new URLSearchParams(window.location.search);
  const name = params.get('shot');
  if (!name || !POSES[name]) return null;
  return { name, ...POSES[name] };
}

// In a shot the plane is flown by a patient autopilot: it holds the pose
// altitude and speed, steers gently for the next ring, and never lands,
// stalls or crashes. The render loop still draws everything for real.
export function holdPose(plane, pose, dt) {
  const hold = pose.hold;
  plane.alt += (hold.alt - plane.alt) * Math.min(1, dt * 1.6);
  plane.speed += (hold.speed - plane.speed) * Math.min(1, dt * 1.6);
  plane.verticalSpeed = (hold.alt - plane.alt) * 0.4;
  plane.throttle = pose.plane.throttle;
  plane.fuel = Math.max(plane.fuel, 62);
  plane.z += Math.cos(plane.heading * Math.PI / 180) * plane.speed * dt;
  plane.x += Math.sin(plane.heading * Math.PI / 180) * plane.speed * dt;
  // Loop the pose: before the plane leaves its scene, rewind it along z.
  if (plane.z > pose.plane.z + 420) {
    plane.z = pose.plane.z;
    plane.x = pose.plane.x;
    plane.alt = pose.plane.alt;
  }
  plane.gearDown = plane.alt < 190;
  plane.elapsed += dt;
}

export function shotLevel(pose) {
  return levelAt(pose.level);
}
