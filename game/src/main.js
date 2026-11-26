// main.js — the game loop and the state machine that ties it together:
// title, flying, mission complete, crashed, and the campaign victory.
// Physics reports events; this file turns them into score, messages,
// sound and screen changes. Screenshot poses (?shot=...) bypass the
// state machine and hold a scene for the camera instead.

import { LEVELS, RING_POINTS, COMBO_STEP, LANDING_MAX_BONUS } from './config.js';
import { buildScenery, buildClouds, buildRings, levelAt } from './world.js';
import { createPlane, stepPlane } from './physics.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { shotPose, holdPose } from './shots.js';

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const input = createInput(canvas);
const renderer = createRenderer(canvas);
const audio = createAudio();
const scenery = buildScenery();
const clouds = buildClouds();

const pose = shotPose();

const game = {
  mode: pose ? 'shot' : 'title',
  levelIndex: pose ? pose.level : 0,
  level: null,
  plane: null,
  rings: [],
  score: 0,          // this mission
  totalScore: 0,     // whole campaign
  combo: 0,
  ringsPassed: 0,
  time: 0,
  missionTime: 0,
  paused: false,
  message: '',
  messageColor: '',
  messageAge: 99,
  endKind: '',
  endTitle: '',
  endLines: [],
  endPrompt: '',
  lastStallBeep: 0,
};

function startMission(levelIndex) {
  game.levelIndex = levelIndex;
  game.level = levelAt(levelIndex);
  game.plane = createPlane(game.level);
  game.rings = buildRings(levelIndex);
  game.score = 0;
  game.combo = 0;
  game.ringsPassed = 0;
  game.missionTime = 0;
  game.paused = false;
  setMessage(game.level.name, '#aee2ff');
  status.textContent = game.level.name + '. ' + game.level.brief;
}

function setMessage(text, color) {
  game.message = text;
  game.messageColor = color || '';
  game.messageAge = 0;
}

function nextRingIndex() {
  const idx = game.rings.findIndex((r) => r.state === 'pending');
  return idx === -1 ? game.rings.length : idx;
}

function landingBonus() {
  // Smooth, slow and straight down the centreline earns the full bonus.
  const sink = Math.abs(game.plane.lastTouchdownSink || 0);
  const sinkScore = Math.max(0, 1 - sink / 5.5);
  const centreScore = Math.max(0, 1 - Math.abs(game.plane.x) / 24);
  const speedScore = Math.max(0, 1 - Math.max(0, game.plane.speed - 34) / 24);
  return Math.round(LANDING_MAX_BONUS * (sinkScore * 0.5 + centreScore * 0.3 + speedScore * 0.2));
}

function handleEvents(events) {
  for (const event of events) {
    if (event === 'ring') {
      const gained = RING_POINTS + game.combo * COMBO_STEP;
      game.score += gained;
      game.combo += 1;
      game.ringsPassed += 1;
      setMessage(game.combo > 1 ? `RING +${gained}  ×${game.combo} COMBO` : `RING +${gained}`, '#ffd76a');
      audio.ring();
    } else if (event === 'ringmissed') {
      game.combo = 0;
      setMessage('RING MISSED', 'rgba(200,205,215,0.9)');
      audio.missed();
    } else if (event === 'takeoff') {
      setMessage('AIRBORNE — FOLLOW THE GOLD RING', '#aee2ff');
      audio.takeoff();
    } else if (event === 'outoffuel') {
      setMessage('FUEL EMPTY — GLIDE FOR THE FAR RUNWAY', '#ffb340');
    } else if (event === 'touchandgo') {
      setMessage('TOUCH AND GO — THE FAR RUNWAY IS THE DELIVERY', '#aee2ff');
    } else if (event === 'landed') {
      const bonus = landingBonus();
      game.score += bonus;
      game.totalScore += game.score;
      const last = game.levelIndex >= LEVELS.length - 1;
      game.mode = 'end';
      game.endKind = 'success';
      game.endTitle = last ? 'ALL POST DELIVERED' : 'MISSION COMPLETE';
      game.endLines = [
        `Rings threaded: ${game.ringsPassed} of ${game.rings.length}`,
        `Landing bonus: +${bonus}`,
        `Mission score: ${game.score}    Campaign total: ${game.totalScore}`,
        last ? 'The harbour route is yours, courier.' : 'The next sack of post is already loaded.',
      ];
      game.endPrompt = last ? 'CLICK OR PRESS ENTER TO FLY THE ROUTE AGAIN' : 'CLICK OR PRESS ENTER FOR THE NEXT MISSION';
      status.textContent = game.endTitle + '. Mission score ' + game.score + '.';
      audio.landed();
    } else if (event.startsWith('crash:')) {
      game.mode = 'end';
      game.endKind = 'crash';
      game.endTitle = 'FLIGHT ENDED';
      game.endLines = [
        event.slice('crash:'.length),
        `Rings threaded: ${game.ringsPassed} of ${game.rings.length}`,
        `Score kept: ${game.totalScore + game.score}`,
      ];
      game.endPrompt = 'CLICK OR PRESS R TO TRY THE MISSION AGAIN';
      status.textContent = game.endTitle + '. ' + game.endLines[0];
      audio.crash();
    }
  }
}

// Screenshot mode: build the posed scene once; the loop just holds it.
if (pose) {
  game.level = levelAt(pose.level);
  game.plane = Object.assign(createPlane(game.level), pose.plane);
  game.rings = buildRings(pose.level);
  // Rings behind the posed plane count as threaded, the one ahead is next.
  for (const ring of game.rings) {
    if (ring.z < game.plane.z - 50) { ring.state = 'passed'; game.ringsPassed += 1; }
  }
  game.score = game.ringsPassed * RING_POINTS;
} else {
  startMission(0);
  game.mode = 'title';
  game.messageAge = 99; // the mission banner waits until the flight starts
}

let lastStamp = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastStamp) / 1000;
  lastStamp = now;
  if (dt > 0.1) dt = 0.1;
  game.time += dt;
  game.messageAge += dt;
  input.poll();

  if (game.mode === 'shot') {
    holdPose(game.plane, pose, dt);
  } else if (game.mode === 'title') {
    if (input.consumeStart()) {
      audio.unlock();
      startMission(game.levelIndex);
      game.mode = 'fly';
    }
  } else if (game.mode === 'fly') {
    if (input.consumePause()) game.paused = !game.paused;
    if (!game.paused) {
      accumulator += dt;
      const step = 1 / 60;
      while (accumulator >= step) {
        accumulator -= step;
        game.missionTime += step;
        handleEvents(stepPlane(game.plane, input, game.level, game.rings, step));
        if (game.mode !== 'fly') { accumulator = 0; break; }
      }
      if (game.plane.stalled && game.time - game.lastStallBeep > 0.28) {
        game.lastStallBeep = game.time;
        audio.stall();
      }
    }
  } else if (game.mode === 'end') {
    const again = input.consumeStart() || input.consumeRestart();
    if (again) {
      audio.unlock();
      if (game.endKind === 'success') {
        startMission(game.levelIndex >= LEVELS.length - 1 ? 0 : game.levelIndex + 1);
        if (game.levelIndex === 0) game.totalScore = 0;
      } else {
        startMission(game.levelIndex);
      }
      game.mode = 'fly';
    }
  }

  audio.update(game.plane);
  renderer.draw({
    plane: game.plane,
    level: game.level,
    rings: game.rings,
    scenery,
    clouds,
    score: game.mode === 'shot' ? game.score : game.totalScore + game.score,
    ringsPassed: game.ringsPassed,
    ringsTotal: game.rings.length,
    nextRing: nextRingIndex(),
    time: game.mode === 'fly' || game.mode === 'shot' ? game.missionTime || game.time : game.time,
    mode: game.mode === 'shot' ? 'fly' : game.mode,
    paused: game.paused,
    message: game.message,
    messageColor: game.messageColor,
    messageAge: game.messageAge,
    endKind: game.endKind,
    endTitle: game.endTitle,
    endLines: game.endLines,
    endPrompt: game.endPrompt,
  });
}

requestAnimationFrame(frame);
