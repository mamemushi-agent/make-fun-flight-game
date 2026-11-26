// render.js — everything the pilot sees, drawn on one canvas: a chase
// view over a patchwork coast, the aircraft with its prop spinning and
// nav lights blinking, glowing rings and two runways, and a lit cockpit
// panel with airspeed, attitude and altimeter gauges under a digital
// altitude / speed / heading readout. All projection is done here; the
// rest of the game thinks in metres and degrees.

import {
  FOV_SCALE, VIEW_DISTANCE, GROUND_CELL, GROUND_SPAN_X,
  START_RUNWAY, FINAL_RUNWAY, RUNWAY_HALF_WIDTH,
} from './config.js';
import { terrainColor } from './world.js';

const HOUSE_COLORS = ['#c96f4a', '#b8b0a0', '#7d94a6', '#c2a15a'];
const RIDGE_FAR = [0.32, 0.5, 0.38, 0.62, 0.44, 0.7, 0.5, 0.36, 0.58, 0.42, 0.66, 0.48];
const RIDGE_NEAR = [0.2, 0.36, 0.26, 0.44, 0.3, 0.52, 0.34, 0.22, 0.4, 0.28, 0.46, 0.32];

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- projection -------------------------------------------------------
  // One view object per frame: where the horizon sits, how the world is
  // rotated by heading, and how the whole scene leans with the bank.
  function makeView(plane) {
    const headRad = plane.heading * Math.PI / 180;
    const rollRad = plane.roll * Math.PI / 180;
    return {
      focal: H * FOV_SCALE,
      cx: W / 2,
      horizon: H * 0.40 + plane.pitch * H * 0.006,
      cosH: Math.cos(headRad),
      sinH: Math.sin(headRad),
      lean: -rollRad * 0.45,
      // The chase camera floats above and behind the aircraft, so the
      // ground has real perspective even while the plane is rolling on it.
      camAlt: plane.alt + 9,
      camBack: 26,
      plane,
    };
  }

  function project(view, x, alt, z) {
    const dx = x - view.plane.x;
    const dz = z - view.plane.z;
    const right = dx * view.cosH - dz * view.sinH;
    const fwd = dx * view.sinH + dz * view.cosH + view.camBack;
    if (fwd < 5) return null;
    const s = view.focal / fwd;
    let sx = view.cx + right * s;
    let sy = view.horizon + (view.camAlt - alt) * s;
    // Lean the world against the bank around the horizon point.
    const lx = sx - view.cx;
    const ly = sy - view.horizon;
    const c = Math.cos(view.lean);
    const n = Math.sin(view.lean);
    sx = view.cx + lx * c - ly * n;
    sy = view.horizon + lx * n + ly * c;
    return { x: sx, y: sy, s, fwd };
  }

  // ---- sky, sun, mountains ----------------------------------------------
  function drawSky(view, plane) {
    const high = Math.min(1, plane.alt / 1100);
    const top = mixColor([58, 110, 178], [30, 58, 120], high);
    const mid = mixColor([126, 178, 224], [84, 124, 190], high);
    const grad = ctx.createLinearGradient(0, 0, 0, view.horizon + 4);
    grad.addColorStop(0, top);
    grad.addColorStop(1, mid);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, view.horizon + 4);

    // Sun, sliding a little with heading so turns feel like travel.
    const sunX = W * 0.78 - plane.heading * 2.2;
    const sunY = H * 0.13;
    const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
    glow.addColorStop(0, 'rgba(255,244,200,0.95)');
    glow.addColorStop(0.25, 'rgba(255,230,150,0.55)');
    glow.addColorStop(1, 'rgba(255,230,150,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 95, sunY - 95, 190, 190);
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 17, 0, Math.PI * 2);
    ctx.fill();

    drawRidge(view, RIDGE_FAR, H * 0.085, '#8fa9c4', plane.x * 0.004 + plane.heading * 0.7);
    drawRidge(view, RIDGE_NEAR, H * 0.055, '#6d8aa8', plane.x * 0.01 + plane.heading * 1.4);
  }

  function drawRidge(view, peaks, height, color, shift) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-20, view.horizon + 2);
    const n = peaks.length;
    for (let i = 0; i <= n; i++) {
      const px = (i / n) * (W + 40) - 20 - (shift % (W / n));
      const py = view.horizon - peaks[i % n] * height - height * 0.3;
      ctx.lineTo(px, py);
    }
    ctx.lineTo(W + 20, view.horizon + 2);
    ctx.closePath();
    ctx.fill();
  }

  // ---- ground -------------------------------------------------------------
  function drawGround(view, plane) {
    // Sea and land base first: two big shapes meeting at the coastline, so
    // the shore reads even where no patchwork cell is drawn.
    const shoreNear = project(view, -350, 0, plane.z + 30);
    const shoreFar = project(view, -350, 0, plane.z + VIEW_DISTANCE);
    ctx.fillStyle = '#2e6da8';
    ctx.fillRect(0, view.horizon, W, H - view.horizon);
    if (shoreNear && shoreFar) {
      ctx.fillStyle = '#79a84f';
      ctx.beginPath();
      ctx.moveTo(shoreFar.x, view.horizon - 2);
      ctx.lineTo(W + 60, view.horizon - 2);
      ctx.lineTo(W + 60, H + 40);
      ctx.lineTo(shoreNear.x, H + 40);
      ctx.closePath();
      ctx.fill();
    }

    // Patchwork cells, far to near, each coloured by its centre.
    const cells = [];
    const z0 = Math.floor((plane.z - VIEW_DISTANCE) / GROUND_CELL) * GROUND_CELL;
    const z1 = plane.z + VIEW_DISTANCE;
    for (let cz = z0; cz < z1; cz += GROUND_CELL) {
      for (let cx = -GROUND_SPAN_X; cx < GROUND_SPAN_X; cx += GROUND_CELL) {
        const centre = project(view, cx + GROUND_CELL / 2, 0, cz + GROUND_CELL / 2);
        if (!centre || centre.fwd > VIEW_DISTANCE) continue;
        cells.push({ cx, cz, fwd: centre.fwd });
      }
    }
    cells.sort((a, b) => b.fwd - a.fwd);
    for (const cell of cells) {
      const p1 = project(view, cell.cx, 0, cell.cz);
      const p2 = project(view, cell.cx + GROUND_CELL, 0, cell.cz);
      const p3 = project(view, cell.cx + GROUND_CELL, 0, cell.cz + GROUND_CELL);
      const p4 = project(view, cell.cx, 0, cell.cz + GROUND_CELL);
      if (!p1 || !p2 || !p3 || !p4) continue;
      ctx.fillStyle = terrainColor(cell.cx + GROUND_CELL / 2, cell.cz + GROUND_CELL / 2);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();
    }

    drawRunway(view, START_RUNWAY);
    drawRunway(view, FINAL_RUNWAY);
  }

  function drawRunway(view, runway) {
    // The asphalt is drawn in slices along its length, so the strip is
    // still drawn when the plane is sitting on it and its far end (or
    // near end) falls behind the camera.
    ctx.fillStyle = '#4a4d52';
    for (let z = runway.zFrom; z < runway.zTo; z += 60) {
      const p1 = project(view, runway.x - RUNWAY_HALF_WIDTH, 0, z);
      const p2 = project(view, runway.x + RUNWAY_HALF_WIDTH, 0, z);
      const p3 = project(view, runway.x + RUNWAY_HALF_WIDTH, 0, z + 60);
      const p4 = project(view, runway.x - RUNWAY_HALF_WIDTH, 0, z + 60);
      if (!p1 || !p2 || !p3 || !p4) continue;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();
    }
    // Centreline dashes and threshold bars.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    for (let z = runway.zFrom + 50; z < runway.zTo - 30; z += 90) {
      const a = project(view, runway.x, 0, z);
      const b = project(view, runway.x, 0, z + 42);
      if (!a || !b) continue;
      ctx.lineWidth = Math.min(7, Math.max(1, 3.2 * a.s));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const endZ of [runway.zFrom + 14, runway.zTo - 14]) {
      const a = project(view, runway.x - RUNWAY_HALF_WIDTH + 4, 0, endZ);
      const b = project(view, runway.x + RUNWAY_HALF_WIDTH - 4, 0, endZ);
      if (!a || !b) continue;
      ctx.lineWidth = Math.min(10, Math.max(1.5, 6 * a.s));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Amber edge lights.
    ctx.fillStyle = '#ffd76a';
    for (let z = runway.zFrom; z <= runway.zTo; z += 110) {
      for (const side of [-1, 1]) {
        const p = project(view, runway.x + side * (RUNWAY_HALF_WIDTH + 3), 0, z);
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.min(6, Math.max(1, 2.4 * p.s)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---- scenery, rings, clouds ---------------------------------------------
  function drawScenery(view, items, t) {
    const drawables = [];
    for (const item of items) {
      const p = project(view, item.x, 0, item.z);
      if (!p || p.fwd > VIEW_DISTANCE) continue;
      drawables.push({ fwd: p.fwd, draw: () => drawItem(item, p, t) });
    }
    drawables.sort((a, b) => b.fwd - a.fwd);
    for (const d of drawables) d.draw();
  }

  function drawItem(item, p, t) {
    const s = p.s;
    const size = item.size * s;
    if (size < 1.2) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (item.kind === 'tree') {
      ctx.fillStyle = '#5d4630';
      ctx.fillRect(-size * 0.05, -size * 0.3, size * 0.1, size * 0.3);
      ctx.fillStyle = '#2f6b33';
      ctx.beginPath();
      ctx.moveTo(0, -size * 1.25);
      ctx.lineTo(size * 0.42, -size * 0.25);
      ctx.lineTo(-size * 0.42, -size * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3a7d3e';
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.95);
      ctx.lineTo(size * 0.5, 0);
      ctx.lineTo(-size * 0.5, 0);
      ctx.closePath();
      ctx.fill();
    } else if (item.kind === 'house') {
      ctx.fillStyle = HOUSE_COLORS[item.hue % HOUSE_COLORS.length];
      ctx.fillRect(-size * 0.5, -size * 0.62, size, size * 0.62);
      ctx.fillStyle = '#6e4630';
      ctx.beginPath();
      ctx.moveTo(-size * 0.62, -size * 0.62);
      ctx.lineTo(0, -size * 1.02);
      ctx.lineTo(size * 0.62, -size * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,236,170,0.9)';
      ctx.fillRect(-size * 0.22, -size * 0.42, size * 0.16, size * 0.16);
    } else if (item.kind === 'boat') {
      ctx.fillStyle = '#e8e4da';
      ctx.beginPath();
      ctx.moveTo(-size * 0.6, 0);
      ctx.lineTo(size * 0.6, 0);
      ctx.lineTo(size * 0.38, size * 0.3);
      ctx.lineTo(-size * 0.38, size * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f7f5ee';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -size * 1.15);
      ctx.lineTo(size * 0.45, 0);
      ctx.closePath();
      ctx.fill();
    } else if (item.kind === 'lighthouse') {
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 ? '#d84f3d' : '#f2ede2';
        const wTop = size * (0.20 - i * 0.02);
        const wBot = size * (0.22 - i * 0.02);
        const yTop = -size * (0.3 + i * 0.22);
        const yBot = -size * (0.08 + i * 0.22);
        ctx.beginPath();
        ctx.moveTo(-wBot, yBot);
        ctx.lineTo(wBot, yBot);
        ctx.lineTo(wTop, yTop);
        ctx.lineTo(-wTop, yTop);
        ctx.closePath();
        ctx.fill();
      }
      const blink = 0.55 + 0.45 * Math.sin(t * 2.4);
      ctx.fillStyle = `rgba(255,240,170,${blink})`;
      ctx.beginPath();
      ctx.arc(0, -size * 1.02, size * 0.12, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === 'hangar') {
      ctx.fillStyle = '#8b95a1';
      ctx.fillRect(-size * 0.8, -size * 0.55, size * 1.6, size * 0.55);
      ctx.beginPath();
      ctx.arc(0, -size * 0.55, size * 0.8, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#5c6672';
      ctx.fillRect(-size * 0.34, -size * 0.5, size * 0.68, size * 0.5);
    } else if (item.kind === 'tower') {
      ctx.fillStyle = '#a9b2bc';
      ctx.fillRect(-size * 0.09, -size, size * 0.18, size);
      ctx.fillStyle = '#31435c';
      ctx.fillRect(-size * 0.3, -size * 1.18, size * 0.6, size * 0.22);
    }
    ctx.restore();
  }

  function drawRings(view, rings, nextIndex, t) {
    const sorted = [...rings].sort((a, b) => b.z - a.z);
    for (const ring of sorted) {
      const p = project(view, ring.x, ring.alt, ring.z);
      if (!p || p.fwd > VIEW_DISTANCE) continue;
      const r = ring.radius * p.s;
      if (r < 2) continue;
      let color = 'rgba(64,200,220,0.85)';
      let width = Math.max(2, r * 0.13);
      if (ring.state === 'passed') color = 'rgba(90,220,130,0.5)';
      if (ring.state === 'missed') color = 'rgba(150,150,150,0.4)';
      if (ring.index === nextIndex && ring.state === 'pending') {
        const pulse = 0.75 + 0.25 * Math.sin(t * 5);
        color = `rgba(255,${Math.round(190 * pulse)},60,0.95)`;
        width = Math.max(3, r * 0.17);
        ctx.save();
        ctx.shadowColor = 'rgba(255,180,40,0.9)';
        ctx.shadowBlur = 22;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r, r * 0.94, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.94, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(1, width * 0.32);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r - width * 0.4, (r - width * 0.4) * 0.94, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawClouds(view, clouds, t) {
    ctx.save();
    for (const cloud of clouds) {
      const driftX = cloud.x + ((t * cloud.drift) % 500) - 250;
      const p = project(view, driftX, cloud.alt, cloud.z);
      if (!p || p.fwd > VIEW_DISTANCE + 400) continue;
      const r = cloud.size * p.s;
      if (r < 3) continue;
      const alpha = Math.max(0.12, 0.5 - p.fwd / 9000);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      for (const [ox, oy, orr] of [[0, 0, 1], [-0.7, 0.12, 0.66], [0.72, 0.1, 0.7], [0.1, -0.3, 0.62]]) {
        ctx.beginPath();
        ctx.ellipse(p.x + ox * r, p.y + oy * r * 0.4, r * orr, r * orr * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---- the aircraft ---------------------------------------------------------
  function drawShadow(view, plane) {
    if (plane.alt > 280 || !plane.airborne) return;
    // The shadow is cast on the ground a little ahead of the plane, where
    // the chase camera can see it; its size is clamped so the projection
    // scale near the camera cannot blow it up.
    const p = project(view, plane.x, 0, plane.z + 55);
    if (!p) return;
    const r = Math.min(80, Math.max(10, 95 * p.s)) * (1 - plane.alt / 560);
    ctx.fillStyle = `rgba(20,30,20,${0.30 * (1 - plane.alt / 300)})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawAircraft(plane, t) {
    const u = Math.min(W, H * 1.6) / 1280; // unit scale for the airframe
    const ax = W / 2;
    const ay = H * 0.635 + Math.sin(t * 2.1) * (plane.airborne ? 2.2 : 0) + plane.pitch * 0.7;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(plane.roll * Math.PI / 180 * 0.85);
    ctx.scale(u, u);

    // Main wing, behind the fuselage, with teal tips and nav lights.
    ctx.fillStyle = '#e8e2d2';
    roundRect(-215, 6, 430, 34, 16);
    ctx.fill();
    ctx.fillStyle = '#1f7a8c';
    roundRect(-215, 6, 52, 34, 16);
    ctx.fill();
    roundRect(163, 6, 52, 34, 16);
    ctx.fill();
    const blink = (t % 1.1) < 0.55;
    ctx.fillStyle = blink ? '#ff5040' : 'rgba(255,80,64,0.25)';
    ctx.beginPath(); ctx.arc(-216, 23, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = blink ? '#3dff7a' : 'rgba(61,255,122,0.25)';
    ctx.beginPath(); ctx.arc(216, 23, 6, 0, Math.PI * 2); ctx.fill();

    // Tailplane and fin (nearest the camera in a chase view).
    ctx.fillStyle = '#dcd4c0';
    roundRect(-92, 86, 184, 20, 9);
    ctx.fill();
    ctx.fillStyle = '#c8452c';
    ctx.beginPath();
    ctx.moveTo(-13, 96);
    ctx.lineTo(0, 44);
    ctx.lineTo(13, 96);
    ctx.closePath();
    ctx.fill();

    // Fuselage tapering away to the nose.
    const body = ctx.createLinearGradient(0, -120, 0, 105);
    body.addColorStop(0, '#f2ecdc');
    body.addColorStop(1, '#cfc6ae');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -128);
    ctx.bezierCurveTo(20, -110, 26, -40, 27, 20);
    ctx.bezierCurveTo(28, 70, 20, 100, 0, 106);
    ctx.bezierCurveTo(-20, 100, -28, 70, -27, 20);
    ctx.bezierCurveTo(-26, -40, -20, -110, 0, -128);
    ctx.fill();
    // Livery stripe.
    ctx.fillStyle = '#1f7a8c';
    ctx.beginPath();
    ctx.moveTo(-26, 30);
    ctx.lineTo(26, 30);
    ctx.lineTo(24, 52);
    ctx.lineTo(-24, 52);
    ctx.closePath();
    ctx.fill();

    // Canopy, glossy and dark.
    const canopy = ctx.createLinearGradient(-10, -96, 12, -40);
    canopy.addColorStop(0, '#7fb6d9');
    canopy.addColorStop(0.5, '#274b66');
    canopy.addColorStop(1, '#16283a');
    ctx.fillStyle = canopy;
    ctx.beginPath();
    ctx.ellipse(0, -68, 13.5, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    // Propeller: a blurred disc and a spinner at the nose.
    const spin = 0.5 + 0.5 * Math.sin(t * 61);
    ctx.fillStyle = `rgba(40,40,40,${0.07 + plane.throttle * 0.07 + spin * 0.03})`;
    ctx.beginPath();
    ctx.ellipse(0, -128, 34, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c8452c';
    ctx.beginPath();
    ctx.ellipse(0, -128, 6.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Gear, when it is down.
    if (plane.gearDown) {
      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-24, 44); ctx.lineTo(-34, 66);
      ctx.moveTo(24, 44); ctx.lineTo(34, 66);
      ctx.stroke();
      ctx.fillStyle = '#22242a';
      ctx.beginPath(); ctx.arc(-35, 70, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(35, 70, 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- cockpit panel and HUD -------------------------------------------------
  function drawPanel(plane, level, t) {
    const panelTop = H * 0.815;
    const grad = ctx.createLinearGradient(0, panelTop, 0, H);
    grad.addColorStop(0, '#2a2f38');
    grad.addColorStop(0.12, '#171b21');
    grad.addColorStop(1, '#0c0f13');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, panelTop + 16);
    ctx.quadraticCurveTo(W / 2, panelTop - 14, W, panelTop + 16);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,170,200,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, panelTop + 16);
    ctx.quadraticCurveTo(W / 2, panelTop - 14, W, panelTop + 16);
    ctx.stroke();

    const gy = panelTop + (H - panelTop) * 0.60;
    const gr = Math.min(50, (H - panelTop) * 0.38);
    drawSpeedGauge(W / 2 - gr * 3.6, gy, gr, plane);
    drawAttitude(W / 2, gy, gr, plane);
    drawAltGauge(W / 2 + gr * 3.6, gy, gr, plane);

    // Throttle and fuel, flanking the gauges.
    drawBar(W / 2 - gr * 5.6, gy - gr * 0.8, 13, gr * 1.6, plane.throttle, '#ffb340', 'THR');
    const fuelFrac = plane.fuel / level.fuel;
    drawBar(W / 2 + gr * 5.35, gy - gr * 0.8, 13, gr * 1.6, fuelFrac, fuelFrac < 0.25 ? '#ff5040' : '#57d977', 'FUEL');

    // Warning lamps.
    drawLamp(W / 2 - gr * 2.1, panelTop + 13, 'STALL', plane.stalled && (t % 0.7) < 0.45, '#ff4030');
    drawLamp(W / 2, panelTop + 13, 'GEAR', plane.gearDown, '#3dff7a');
    drawLamp(W / 2 + gr * 2.1, panelTop + 13, 'FUEL', plane.fuel < level.fuel * 0.25 && (t % 1) < 0.7, '#ffb340');
  }

  function drawLamp(x, y, label, on, color) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = on ? color : 'rgba(120,130,140,0.25)';
    if (on) { ctx.shadowColor = color; ctx.shadowBlur = 10; }
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(200,215,230,0.75)';
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.fillText(label, x, y + 17);
    ctx.restore();
  }

  function drawBar(x, y, w, h, frac, color, label) {
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    const fh = h * clamp01(frac);
    ctx.fillRect(x, y + h - fh, w, fh);
    ctx.fillStyle = 'rgba(200,215,230,0.8)';
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h + 12);
  }

  function gaugeShell(x, y, r, label) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
    g.addColorStop(0, '#39424e');
    g.addColorStop(1, '#14181d');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0d1420';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(190,210,230,0.85)';
    ctx.font = `600 ${Math.max(8, r * 0.19)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + r * 0.72);
  }

  function needle(x, y, r, angle, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(angle) * r * 0.18, y - Math.sin(angle) * r * 0.18);
    ctx.lineTo(x + Math.cos(angle) * r * 0.82, y + Math.sin(angle) * r * 0.82);
    ctx.stroke();
    ctx.fillStyle = '#dfe8f2';
    ctx.beginPath(); ctx.arc(x, y, r * 0.09, 0, Math.PI * 2); ctx.fill();
  }

  function drawSpeedGauge(x, y, r, plane) {
    gaugeShell(x, y, r, 'AIRSPEED');
    const kt = plane.speed * 1.944;
    ctx.strokeStyle = 'rgba(220,235,250,0.8)';
    ctx.fillStyle = 'rgba(220,235,250,0.9)';
    ctx.font = `${Math.max(7, r * 0.17)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    for (let v = 0; v <= 160; v += 20) {
      const a = gaugeAngle(v / 160);
      const c = Math.cos(a);
      const s = Math.sin(a);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x + c * r * 0.8, y + s * r * 0.8);
      ctx.lineTo(x + c * r * 0.93, y + s * r * 0.93);
      ctx.stroke();
      ctx.fillText(String(v), x + c * r * 0.6, y + s * r * 0.6 + 3);
    }
    needle(x, y, r, gaugeAngle(kt / 160), '#ffb340');
    ctx.fillStyle = 'rgba(6,10,16,0.85)';
    ctx.fillRect(x - r * 0.42, y + r * 0.28, r * 0.84, r * 0.3);
    ctx.fillStyle = '#ffd76a';
    ctx.font = `700 ${Math.max(9, r * 0.22)}px ui-monospace, monospace`;
    ctx.fillText(`${Math.round(kt)} kt`, x, y + r * 0.50);
  }

  function drawAltGauge(x, y, r, plane) {
    gaugeShell(x, y, r, 'ALTIMETER');
    ctx.strokeStyle = 'rgba(220,235,250,0.8)';
    ctx.fillStyle = 'rgba(220,235,250,0.9)';
    ctx.font = `${Math.max(7, r * 0.17)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    for (let v = 0; v < 10; v++) {
      const a = -Math.PI / 2 + (v / 10) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x + c * r * 0.8, y + s * r * 0.8);
      ctx.lineTo(x + c * r * 0.93, y + s * r * 0.93);
      ctx.stroke();
      ctx.fillText(String(v), x + c * r * 0.6, y + s * r * 0.6 + 3);
    }
    const turns = (plane.alt % 1000) / 1000;
    needle(x, y, r, -Math.PI / 2 + turns * Math.PI * 2, '#7fd0ff');
    ctx.fillStyle = 'rgba(6,10,16,0.85)';
    ctx.fillRect(x - r * 0.42, y + r * 0.28, r * 0.84, r * 0.3);
    ctx.fillStyle = '#aee2ff';
    ctx.font = `700 ${Math.max(9, r * 0.22)}px ui-monospace, monospace`;
    ctx.fillText(`${Math.round(plane.alt)} m`, x, y + r * 0.50);
  }

  function drawAttitude(x, y, r, plane) {
    gaugeShell(x, y, r, 'HORIZON');
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.94, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(-plane.roll * Math.PI / 180);
    ctx.translate(0, plane.pitch * r * 0.035);
    ctx.fillStyle = '#3f7fc1';
    ctx.fillRect(-r, -r * 1.6, r * 2, r * 1.6);
    ctx.fillStyle = '#7a5a36';
    ctx.fillRect(-r, 0, r * 2, r * 1.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.4;
    for (const off of [-0.35, 0.35]) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, off * r);
      ctx.lineTo(r * 0.3, off * r);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.restore();
    // Fixed aircraft symbol.
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.55, y);
    ctx.lineTo(x - r * 0.16, y);
    ctx.lineTo(x - r * 0.16, y + r * 0.12);
    ctx.moveTo(x + r * 0.55, y);
    ctx.lineTo(x + r * 0.16, y);
    ctx.lineTo(x + r * 0.16, y + r * 0.12);
    ctx.stroke();
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath(); ctx.arc(x, y, r * 0.045, 0, Math.PI * 2); ctx.fill();
  }

  function gaugeAngle(frac) {
    // Gauges sweep from 135 degrees (bottom left) clockwise to 45.
    return Math.PI * 0.75 + clamp01(frac) * Math.PI * 1.5;
  }

  function drawHud(state) {
    const { plane, level } = state;
    ctx.save();
    // Digital readouts, top left.
    ctx.textAlign = 'left';
    const hdg = ((Math.round(plane.heading) % 360) + 360) % 360;
    const items = [
      ['ALT', `${Math.round(plane.alt)} m`],
      ['SPD', `${Math.round(plane.speed * 1.944)} kt`],
      ['HDG', `${String(hdg).padStart(3, '0')}°`],
      ['V/S', `${plane.verticalSpeed >= 0 ? '+' : ''}${plane.verticalSpeed.toFixed(1)}`],
    ];
    ctx.font = '700 21px ui-monospace, monospace';
    items.forEach(([label, value], i) => {
      const x = 18 + i * 118;
      ctx.fillStyle = 'rgba(8,16,26,0.55)';
      ctx.fillRect(x - 6, 12, 108, 44);
      ctx.fillStyle = 'rgba(150,190,225,0.9)';
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillText(label, x, 26);
      ctx.fillStyle = '#eaf4ff';
      ctx.font = '700 21px ui-monospace, monospace';
      ctx.fillText(value, x, 50);
    });

    // Compass strip, top centre.
    drawCompass(W / 2, 34, 300, plane.heading);

    // Score block, top right.
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(8,16,26,0.55)';
    ctx.fillRect(W - 218, 12, 200, 76);
    ctx.fillStyle = 'rgba(150,190,225,0.9)';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillText(level.name.toUpperCase(), W - 26, 28);
    ctx.fillStyle = '#ffd76a';
    ctx.font = '700 22px ui-monospace, monospace';
    ctx.fillText(`${state.score}`, W - 26, 54);
    ctx.fillStyle = '#eaf4ff';
    ctx.font = '600 13px ui-monospace, monospace';
    ctx.fillText(`RINGS ${state.ringsPassed}/${state.ringsTotal}   ${formatTime(state.time)}`, W - 26, 78);
    if (level.wind > 0) {
      ctx.fillStyle = 'rgba(174,226,255,0.9)';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText(`WIND → ${level.wind.toFixed(1)} m/s`, W - 26, 104);
    }

    // Reticle and next-ring guide.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.40, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.40, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Centre message (ring scored, warnings, instructions).
    if (state.message && state.messageAge < 2.4) {
      const fade = state.messageAge > 1.7 ? 1 - (state.messageAge - 1.7) / 0.7 : 1;
      ctx.textAlign = 'center';
      ctx.font = '800 30px system-ui, sans-serif';
      ctx.fillStyle = state.messageColor || `rgba(255,215,106,${fade})`;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 8;
      ctx.fillText(state.message, W / 2, H * 0.24);
      ctx.shadowBlur = 0;
    }
    if (plane.stalled) {
      ctx.textAlign = 'center';
      ctx.font = '800 24px system-ui, sans-serif';
      ctx.fillStyle = (state.time % 0.7) < 0.45 ? '#ff5040' : 'rgba(255,80,64,0.25)';
      ctx.fillText('STALL — NOSE DOWN, ADD POWER', W / 2, H * 0.30);
    }
    ctx.restore();
  }

  function drawCompass(x, y, width, heading) {
    ctx.save();
    ctx.fillStyle = 'rgba(8,16,26,0.55)';
    ctx.fillRect(x - width / 2, y - 16, width, 32);
    ctx.beginPath();
    ctx.rect(x - width / 2, y - 16, width, 32);
    ctx.clip();
    ctx.textAlign = 'center';
    const pxPerDeg = width / 80;
    const base = Math.floor((heading - 40) / 5) * 5;
    for (let d = base; d <= heading + 45; d += 5) {
      const norm = ((d % 360) + 360) % 360;
      const px = x + (d - heading) * pxPerDeg;
      ctx.strokeStyle = 'rgba(220,235,250,0.7)';
      ctx.beginPath();
      ctx.moveTo(px, y + 8);
      ctx.lineTo(px, y + (norm % 30 === 0 ? 14 : 11));
      ctx.stroke();
      if (norm % 30 !== 0) continue;
      const label = norm === 0 ? 'N' : norm === 90 ? 'E' : norm === 180 ? 'S' : norm === 270 ? 'W' : String(norm / 10);
      ctx.fillStyle = norm % 90 === 0 ? '#ffd76a' : 'rgba(220,235,250,0.85)';
      ctx.font = norm % 90 === 0 ? '700 13px system-ui, sans-serif' : '10px system-ui, sans-serif';
      ctx.fillText(label, px, y + 2);
    }
    ctx.restore();
    ctx.fillStyle = '#ffb340';
    ctx.beginPath();
    ctx.moveTo(x, y - 20);
    ctx.lineTo(x - 5, y - 27);
    ctx.lineTo(x + 5, y - 27);
    ctx.closePath();
    ctx.fill();
  }

  // ---- overlays ---------------------------------------------------------------
  function drawTitle(state) {
    ctx.fillStyle = 'rgba(6,14,24,0.52)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd76a';
    ctx.font = '800 54px system-ui, sans-serif';
    ctx.fillText('SKY COURIER', W / 2, H * 0.20);
    ctx.fillStyle = '#eaf4ff';
    ctx.font = '700 25px system-ui, sans-serif';
    ctx.fillText('H A R B O R   R U N', W / 2, H * 0.20 + 40);
    ctx.font = '400 17px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(230,242,255,0.92)';
    const lines = [
      'Deliver the post up the coast: take off from the home strip,',
      'thread every glowing ring, and land on the far runway.',
      '',
      'STEER   Arrow keys or A/D — or move the mouse',
      'PITCH   Up / Down arrows — or the mouse',
      'POWER   W / S or the mouse wheel',
      'Rotate past 56 kt, keep her above 45 kt, land slow and straight.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, W / 2, H * 0.36 + i * 25));
    ctx.fillStyle = '#ffd76a';
    ctx.font = '700 20px system-ui, sans-serif';
    const pulse = 0.6 + 0.4 * Math.sin(state.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillText('CLICK OR PRESS ENTER TO FLY', W / 2, H * 0.36 + lines.length * 25 + 26);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(200,220,240,0.75)';
    ctx.font = '400 13px system-ui, sans-serif';
    ctx.fillText(state.level.name + ' — ' + state.level.brief, W / 2, H * 0.70);
  }

  function drawEnd(state) {
    ctx.fillStyle = 'rgba(6,12,20,0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = state.endKind === 'crash' ? '#ff7a5c' : '#8fe3a0';
    ctx.font = '800 42px system-ui, sans-serif';
    ctx.fillText(state.endTitle, W / 2, H * 0.30);
    ctx.fillStyle = 'rgba(235,245,255,0.95)';
    ctx.font = '400 18px system-ui, sans-serif';
    state.endLines.forEach((line, i) => ctx.fillText(line, W / 2, H * 0.30 + 44 + i * 27));
    ctx.fillStyle = '#ffd76a';
    ctx.font = '700 19px system-ui, sans-serif';
    ctx.fillText(state.endPrompt, W / 2, H * 0.30 + 44 + state.endLines.length * 27 + 30);
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(6,12,20,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eaf4ff';
    ctx.font = '800 36px system-ui, sans-serif';
    ctx.fillText('PAUSED', W / 2, H * 0.42);
    ctx.font = '400 16px system-ui, sans-serif';
    ctx.fillText('Press P to keep flying', W / 2, H * 0.42 + 34);
  }

  // ---- one frame ----------------------------------------------------------------
  function draw(state) {
    const { plane } = state;
    const view = makeView(plane);
    drawSky(view, plane);
    drawGround(view, plane);
    drawShadow(view, plane);
    drawScenery(view, state.scenery, state.time);
    drawRings(view, state.rings, state.nextRing, state.time);
    drawClouds(view, state.clouds, state.time);
    drawAircraft(plane, state.time);
    drawPanel(plane, state.level, state.time);
    drawHud(state);
    if (state.mode === 'title') drawTitle(state);
    if (state.mode === 'end') drawEnd(state);
    if (state.paused) drawPaused();
  }

  return { draw, size: () => ({ w: W, h: H }) };
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function mixColor(a, b, f) {
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgb(${r},${g},${bl})`;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
