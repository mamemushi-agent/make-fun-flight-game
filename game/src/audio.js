// audio.js — all sound is synthesised with WebAudio: a puttering engine
// whose pitch follows the throttle, wind that rises with speed, a chime
// for a ring threaded, and dull thuds for arrivals good and bad. No audio
// files, nothing loaded. Sound starts on the first user gesture, as
// browsers require; in screenshot mode it simply never starts.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windGain = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineOsc.connect(engineFilter).connect(engineGain).connect(ctx.destination);
    engineOsc.start();

    // Wind: looped filtered noise, gain set by airspeed each frame.
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    noise.connect(windFilter).connect(windGain).connect(ctx.destination);
    noise.start();
    return true;
  }

  function tone(freq, at, dur, type, gain) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime + at);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(ctx.currentTime + at);
    osc.stop(ctx.currentTime + at + dur + 0.02);
  }

  return {
    unlock() { ensure(); },
    update(plane) {
      if (!ctx || !engineGain) return;
      const running = plane.fuel > 0 ? 1 : 0;
      engineOsc.frequency.value = 52 + plane.throttle * 68 * running + plane.speed * 0.22 * running;
      engineGain.gain.value = 0.028 * running * (0.4 + plane.throttle * 0.6);
      windGain.gain.value = Math.min(0.05, plane.speed * 0.0007) * (plane.airborne ? 1 : 0.3);
    },
    ring() { tone(880, 0, 0.16, 'sine', 0.12); tone(1318, 0.09, 0.22, 'sine', 0.1); },
    missed() { tone(196, 0, 0.2, 'triangle', 0.07); },
    takeoff() { tone(523, 0, 0.14, 'sine', 0.08); tone(784, 0.1, 0.2, 'sine', 0.08); },
    landed() { tone(392, 0, 0.16, 'sine', 0.1); tone(523, 0.12, 0.16, 'sine', 0.1); tone(659, 0.24, 0.3, 'sine', 0.1); },
    crash() { tone(82, 0, 0.5, 'sawtooth', 0.16); tone(55, 0.05, 0.6, 'square', 0.1); },
    stall() { tone(1174, 0, 0.09, 'square', 0.035); },
  };
}
