// physics.js — a small, honest flight model. Throttle sets the speed the
// engine drags the plane toward; pitch trades speed for height; bank turns
// the nose; slow flight with the nose high stalls. The model also judges
// take-offs, ring passes, landings and crashes, and reports events back to
// the game loop instead of touching score or screens itself.

import {
  ROTATE_SPEED, STALL_SPEED, MAX_SPEED, IDLE_SPEED,
  TOUCHDOWN_MAX_SINK, TOUCHDOWN_MAX_SPEED,
  START_RUNWAY, FINAL_RUNWAY, RUNWAY_HALF_WIDTH, COURSE_END_Z,
} from './config.js';

export function createPlane(level) {
  return {
    x: 0, alt: 0, z: 0,               // metres; starts on the start runway
    speed: 0,                          // m/s
    heading: 0,                        // degrees, 0 = north
    pitch: 0,                          // degrees, positive = nose up
    roll: 0,                           // degrees, positive = right wing down
    verticalSpeed: 0,                  // m/s
    throttle: 0,
    lastTouchdownSink: 0,
    fuel: level.fuel,
    airborne: false,
    stalled: false,
    gearDown: true,
    elapsed: 0,
  };
}

function onRunway(plane, runway) {
  return Math.abs(plane.x - runway.x) < RUNWAY_HALF_WIDTH
    && plane.z > runway.zFrom && plane.z < runway.zTo;
}

function headingError(plane) {
  // Smallest angle between the nose and north, either way around.
  let h = plane.heading % 360;
  if (h > 180) h -= 360;
  if (h < -180) h += 360;
  return Math.abs(h);
}

// Advance one step. Returns a list of event strings ('ring', 'takeoff',
// 'landed', 'crash:reason', 'outoffuel') for the game loop to act on.
export function stepPlane(plane, input, level, rings, dt) {
  const events = [];
  plane.elapsed += dt;

  // Throttle and fuel. An empty tank means a glider, not a stop mid-air.
  plane.throttle = clamp(plane.throttle + input.throttleDelta, 0, 1);
  input.throttleDelta = 0;
  if (plane.fuel > 0) {
    const burn = dt * (0.15 + plane.throttle * 0.55) * (level.burn || 1) * 0.55;
    plane.fuel = Math.max(0, plane.fuel - burn);
    if (plane.fuel === 0) events.push('outoffuel');
  }
  const power = plane.fuel > 0 ? plane.throttle : 0;

  // Attitude follows the controls, gently on the ground, crisply in the air.
  const authority = plane.airborne ? 1 : clamp(plane.speed / ROTATE_SPEED, 0.15, 1);
  const targetRoll = input.roll * 46;
  const targetPitch = input.pitch * 16;
  plane.roll += (targetRoll - plane.roll) * Math.min(1, dt * 5.2) * authority + plane.roll * 0 * dt;
  plane.pitch += (targetPitch - plane.pitch) * Math.min(1, dt * 3.4) * authority;

  // Gusts worry the airframe on the storm mission: a pure function of time
  // so the wobble is the same shape for every pilot.
  let gustPitch = 0;
  let gustRoll = 0;
  if (level.gust > 0 && plane.airborne) {
    gustPitch = Math.sin(plane.elapsed * 1.7) * level.gust * 1.6;
    gustRoll = Math.sin(plane.elapsed * 1.13 + 2.1) * level.gust * 4.5;
  }

  // Speed: the engine pulls toward a throttle-set speed, climbing costs
  // speed, diving gains it, and drag caps the dive.
  const pitchRad = (plane.pitch + gustPitch) * Math.PI / 180;
  const cruise = IDLE_SPEED + power * (MAX_SPEED - IDLE_SPEED);
  plane.speed += (cruise - plane.speed) * dt * 0.32;
  plane.speed -= Math.sin(pitchRad) * 9.8 * dt * 0.55;
  plane.speed = clamp(plane.speed, 0, MAX_SPEED + 14);

  // Turning: banked wings turn the nose, faster when the air is moving.
  const rollRad = (plane.roll + gustRoll) * Math.PI / 180;
  if (plane.airborne) {
    const turnRate = Math.tan(clamp(rollRad, -0.9, 0.9)) * 26 * clamp(plane.speed / 46, 0.35, 1.25);
    plane.heading += turnRate * dt;
  }

  // Vertical: pitch and speed make climb; below stall speed the nose drops.
  plane.stalled = plane.airborne && plane.speed < STALL_SPEED && plane.pitch > 2;
  if (!plane.airborne) {
    plane.verticalSpeed = 0;
    if (plane.pitch > 3 && plane.speed > ROTATE_SPEED) {
      plane.airborne = true;
      plane.verticalSpeed = 2.2;
      events.push('takeoff');
    }
  } else {
    let vs = Math.sin(pitchRad) * plane.speed * 0.62 - 2.1;
    if (plane.stalled) vs -= 6.5;
    if (plane.speed < STALL_SPEED) vs -= (STALL_SPEED - plane.speed) * 0.22;
    plane.verticalSpeed += (vs - plane.verticalSpeed) * Math.min(1, dt * 4);
  }
  plane.alt += plane.verticalSpeed * dt;

  // Forward motion, plus the sea wind pushing the plane sideways.
  const headRad = plane.heading * Math.PI / 180;
  const prevZ = plane.z;
  plane.x += Math.sin(headRad) * plane.speed * dt + (plane.airborne ? level.wind * dt : 0);
  plane.z += Math.cos(headRad) * plane.speed * dt;
  plane.gearDown = plane.alt < 190;

  // Rings are judged as the plane crosses each ring's plane.
  for (const ring of rings) {
    if (ring.state !== 'pending') continue;
    if (prevZ < ring.z && plane.z >= ring.z) {
      const dx = plane.x - ring.x;
      const dy = plane.alt - ring.alt;
      if (Math.hypot(dx, dy) <= ring.radius && plane.airborne) {
        ring.state = 'passed';
        events.push('ring');
      } else if (plane.z > ring.z) {
        ring.state = 'missed';
        events.push('ringmissed');
      }
    }
  }

  // The ground. Arriving on a runway gently is a landing; anything else
  // that meets the ground is a crash with a reason the pilot can learn from.
  if (plane.alt <= 0) {
    plane.alt = 0;
    const onStart = onRunway(plane, START_RUNWAY);
    const onFinal = onRunway(plane, FINAL_RUNWAY);
    if (!plane.airborne) {
      // Rolling: wandering far off the grass strip at speed is a crash.
      // Rolling past the end of the runway is merely embarrassing.
      if (!onStart && !onFinal && Math.abs(plane.x) > 110 && plane.speed > 12) {
        events.push('crash:You ran off the strip and dug a wingtip in.');
        return events;
      }
    } else if (onStart || onFinal) {
      if (headingError(plane) > 28) {
        events.push('crash:You touched down sideways and the gear folded.');
      } else if (plane.verticalSpeed < -TOUCHDOWN_MAX_SINK) {
        events.push('crash:Too hard a arrival — the gear collapsed.');
      } else if (plane.speed > TOUCHDOWN_MAX_SPEED) {
        events.push('crash:Far too fast to land — the runway ran out.');
      } else {
        plane.lastTouchdownSink = plane.verticalSpeed;
        plane.airborne = false;
        plane.verticalSpeed = 0;
        plane.pitch = 0;
        plane.roll = 0;
        if (onFinal) {
          events.push('landed');
        } else {
          events.push('touchandgo');
        }
      }
    } else {
      events.push(plane.x < -350
        ? 'crash:You ditched in the sea short of the coast.'
        : 'crash:You met the ground away from any runway.');
    }
    if (events.some((e) => e.startsWith('crash'))) return events;
  }

  if (plane.z > COURSE_END_Z + 900 || plane.alt > 1500) {
    events.push('crash:You flew on past the field and the flight was called.');
  }
  return events;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
