// input.js — keyboard and mouse, folded into one controls object the
// physics step reads. Keyboard: arrows (or A/D) roll, up/down arrows
// pitch, W/S throttle, Enter/Space start, R restart, P pause. Mouse:
// moving it banks and pitches toward the pointer, the wheel trims the
// throttle, and a click starts or restarts.

export function createInput(canvas) {
  const keys = new Set();
  const input = {
    pitch: 0,      // -1 nose down .. 1 nose up
    roll: 0,       // -1 bank left .. 1 bank right
    throttleDelta: 0,
    startPressed: false,
    restartPressed: false,
    pausePressed: false,
    mouseActive: false,
    mouseX: 0,     // -1 .. 1 across the canvas
    mouseY: 0,     // -1 .. 1 down the canvas
    consumeStart() { const v = this.startPressed; this.startPressed = false; return v; },
    consumeRestart() { const v = this.restartPressed; this.restartPressed = false; return v; },
    consumePause() { const v = this.pausePressed; this.pausePressed = false; return v; },
  };

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (e.code === 'Enter' || e.code === 'Space') input.startPressed = true;
    if (e.code === 'KeyR') input.restartPressed = true;
    if (e.code === 'KeyP') input.pausePressed = true;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    input.mouseY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    input.mouseActive = true;
  });
  canvas.addEventListener('mouseleave', () => { input.mouseActive = false; });
  canvas.addEventListener('mousedown', () => { input.startPressed = true; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    input.throttleDelta += e.deltaY < 0 ? 0.07 : -0.07;
  }, { passive: false });

  // Fold the held keys into control deflections once per frame.
  input.poll = function poll() {
    let pitch = 0;
    let roll = 0;
    if (keys.has('ArrowUp')) pitch += 1;
    if (keys.has('ArrowDown')) pitch -= 1;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) roll += 1;
    if (keys.has('KeyW')) input.throttleDelta += 0.012;
    if (keys.has('KeyS')) input.throttleDelta -= 0.012;
    if (input.mouseActive && (pitch === 0 && roll === 0)) {
      // The mouse steers only while no key is held, so the two never fight.
      roll = clampUnit(input.mouseX * 1.15);
      pitch = clampUnit(-input.mouseY * 0.9);
    }
    input.pitch = pitch;
    input.roll = roll;
  };

  return input;
}

function clampUnit(v) {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}
