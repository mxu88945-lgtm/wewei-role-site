// Original source: pwa-sense-bridge by 0xblewalker (https://github.com/0xblewalker/pwa-sense-bridge).
// Licensed under AGPL-3.0-only. This attribution and license notice are retained.
import { angleDelta, circularMean, clamp, classifyRotation, gravityRoll } from './math.js';

const nowIso = () => new Date().toISOString();

function screenAngle() {
  if (typeof screen === 'undefined') return 0;
  const value = Number(screen.orientation?.angle);
  return Number.isFinite(value) ? value : Number(globalThis.orientation) || 0;
}

async function requestEventPermission(EventType) {
  if (!EventType || typeof EventType.requestPermission !== 'function') return 'not-required';
  const result = await EventType.requestPermission();
  // Hark patch: outside a tap iOS can answer 'denied' without ever asking. Only trust a
  // denial that came from inside a tap; otherwise wait for the next tap and ask then.
  if (result === 'denied' && !globalThis.navigator?.userActivation?.isActive) return 'needs-tap';
  return result;
}

// Hark patch: iOS only unlocks audio / motion permission inside a tap. When the app
// restores a saved switch on launch or after returning from background there is no tap,
// so wait for the next touch anywhere and finish turning the sense on then.
function onEveryGesture(fn) {
  const types = ['touchend', 'click', 'keydown'];
  types.forEach((type) => addEventListener(type, fn, true));
  return () => types.forEach((type) => removeEventListener(type, fn, true));
}

export function detectCapabilities(scope = globalThis) {
  const secure = scope.isSecureContext === true;
  return {
    secureContext: secure,
    microphone: Boolean(secure && scope.navigator?.mediaDevices?.getUserMedia),
    orientation: Boolean(secure && scope.DeviceOrientationEvent),
    motion: Boolean(secure && scope.DeviceMotionEvent),
    touch: Boolean(scope.PointerEvent),
    cameraPicker: Boolean(scope.FileReader && scope.document?.createElement)
  };
}

export class SenseBridge extends EventTarget {
  constructor(options = {}) {
    super();
    this.options = {
      calibrationSamples: 20,
      rotationCooldown: 3000,
      shakeCooldown: 4000,
      blowCooldown: 5000,
      ...options
    };
    this.localOnly = Boolean(options.localOnly);
    this.cleanups = new Map();
    this.lastDiagnosticDispatch = 0;
    this.diagnostic = {
      capabilities: detectCapabilities(),
      permissions: {},
      calibration: null,
      sensor: null,
      event: null
    };
  }

  capabilities() {
    this.diagnostic.capabilities = detectCapabilities();
    this.#diagnose();
    return { ...this.diagnostic.capabilities };
  }

  setLocalOnly(value) {
    this.localOnly = Boolean(value);
    this.#diagnose();
  }

  report() {
    return JSON.parse(JSON.stringify(this.diagnostic));
  }

  disable(name) {
    const cleanup = this.cleanups.get(name);
    if (cleanup) cleanup();
    this.cleanups.delete(name);
  }

  disableAll() {
    for (const name of [...this.cleanups.keys()]) this.disable(name);
  }

  async enableBlow() {
    if (this.cleanups.has('blow')) return;
    const capabilities = this.capabilities();
    if (!capabilities.microphone) throw new Error('Microphone sensing requires HTTPS and getUserMedia.');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false
    });
    this.diagnostic.permissions.microphone = 'granted';
    const AudioContextType = globalThis.AudioContext || globalThis.webkitAudioContext;
    const context = new AudioContextType();
    const wake = () => { if (context.state !== 'running' && context.state !== 'closed') context.resume?.().catch(() => {}); };
    wake();
    const stopWake = onEveryGesture(wake);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.35;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let baseline = [];
    let loudSince = 0;
    let needsQuiet = false;
    let lastAt = 0;
    let frame = 0;
    const started = performance.now();
    const sample = (time) => {
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const value of samples) {
        const centered = (value - 128) / 128;
        energy += centered * centered;
      }
      const rms = Math.sqrt(energy / samples.length);
      if (time - started < 800) baseline.push(rms);
      const floor = baseline.length ? baseline.reduce((a, b) => a + b, 0) / baseline.length : 0.015;
      const threshold = Math.max(0.075, floor * 3.2);
      this.#sensor({ type: 'microphone', rms: +rms.toFixed(3), threshold: +threshold.toFixed(3) });
      if (rms < threshold * 0.55) needsQuiet = false;
      if (!needsQuiet && rms > threshold && Date.now() - lastAt > this.options.blowCooldown) {
        if (!loudSince) loudSince = time;
        if (time - loudSince > 180) {
          lastAt = Date.now();
          loudSince = 0;
          needsQuiet = true;
          this.#emit('user_blowing', clamp((rms - threshold) / Math.max(0.12, 0.32 - threshold)));
        }
      } else if (rms <= threshold) loudSince = 0;
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    this.cleanups.set('blow', () => {
      stopWake();
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((track) => track.stop());
      if (context.state !== 'closed') context.close().catch(() => {});
    });
  }

  async enableRotation() {
    if (this.cleanups.has('rotation')) return;
    const capabilities = this.capabilities();
    if (!capabilities.motion && !capabilities.orientation) throw new Error('Rotation sensing is unavailable.');
    let orientationPermission, motionPermission;
    try { orientationPermission = await requestEventPermission(globalThis.DeviceOrientationEvent); } catch { orientationPermission = 'needs-tap'; }
    if (orientationPermission === 'denied') throw new Error('Orientation permission denied.');
    try { motionPermission = await requestEventPermission(globalThis.DeviceMotionEvent); } catch { motionPermission = 'needs-tap'; }
    this.diagnostic.permissions.rotation = { orientation: orientationPermission, motion: motionPermission };

    let calibration = [];
    let center = null;
    let orientationCenter = null;
    let lastMotionAt = 0;
    let lastEventAt = 0;
    let armed = true;

    const reset = () => {
      calibration = [];
      center = null;
      orientationCenter = null;
      armed = true;
      this.diagnostic.calibration = { state: 'collecting', samples: 0 };
      this.#diagnose();
    };

    const detect = (side, tilt = 0) => {
      if (Math.abs(side) < 12 && Math.abs(tilt) < 15) {
        armed = true;
        return;
      }
      if (!armed || Date.now() - lastEventAt < this.options.rotationCooldown) return;
      const result = classifyRotation(side, tilt);
      if (!result) return;
      armed = false;
      lastEventAt = Date.now();
      this.#emit('device_rotated', clamp(result.amount / 90), { direction: result.direction });
    };

    const onMotion = (event) => {
      const gravity = event.accelerationIncludingGravity;
      if (gravity?.x == null || gravity?.y == null) return;
      const roll = gravityRoll(gravity, screenAngle());
      if (center == null) {
        calibration.push(roll);
        this.diagnostic.calibration = { state: 'collecting', samples: calibration.length };
        if (calibration.length >= this.options.calibrationSamples) {
          center = circularMean(calibration);
          this.diagnostic.calibration = { state: 'ready', centerRoll: +center.toFixed(1) };
        }
        this.#diagnose();
        return;
      }
      const side = angleDelta(roll, center);
      if (Math.abs(side) < 10) center = roll;
      lastMotionAt = Date.now();
      this.#sensor({ type: 'gravity-roll', roll: +roll.toFixed(1), relative: +side.toFixed(1), screenAngle: screenAngle() });
      detect(side);
    };

    const onOrientation = (event) => {
      if (event.beta == null || event.gamma == null || Date.now() - lastMotionAt < 500) return;
      if (!orientationCenter) {
        orientationCenter = { beta: event.beta, gamma: event.gamma };
        return;
      }
      const side = angleDelta(event.gamma, orientationCenter.gamma);
      const tilt = angleDelta(event.beta, orientationCenter.beta);
      if (Math.abs(side) < 10 && Math.abs(tilt) < 12) orientationCenter = { beta: event.beta, gamma: event.gamma };
      this.#sensor({ type: 'euler-fallback', beta: +event.beta.toFixed(1), gamma: +event.gamma.toFixed(1), side: +side.toFixed(1) });
      detect(side, tilt);
    };

    const attach = () => {
      addEventListener('devicemotion', onMotion, true);
      addEventListener('deviceorientation', onOrientation, true);
    };
    let stopAsk = () => {};
    if (orientationPermission === 'needs-tap' || motionPermission === 'needs-tap') {
      let attached = false;
      stopAsk = onEveryGesture(() => {
        if (attached) return;
        Promise.all([requestEventPermission(globalThis.DeviceOrientationEvent), requestEventPermission(globalThis.DeviceMotionEvent)]).then(([o, m]) => {
          const ok = (r) => r === 'granted' || r === 'not-required';
          if (attached || !this.cleanups.has('rotation') || !(ok(o) || ok(m))) return;
          attached = true;
          stopAsk();
          this.diagnostic.permissions.rotation = { orientation: o, motion: m };
          attach();
        }).catch(() => {});
      });
    } else attach();
    addEventListener('orientationchange', reset);
    screen.orientation?.addEventListener?.('change', reset);
    reset();
    this.cleanups.set('rotation', () => {
      stopAsk();
      removeEventListener('devicemotion', onMotion, true);
      removeEventListener('deviceorientation', onOrientation, true);
      removeEventListener('orientationchange', reset);
      screen.orientation?.removeEventListener?.('change', reset);
    });
  }

  async enableShake() {
    if (this.cleanups.has('shake')) return;
    if (!this.capabilities().motion) throw new Error('Shake sensing is unavailable.');
    let permission;
    try { permission = await requestEventPermission(globalThis.DeviceMotionEvent); } catch { permission = 'needs-tap'; }
    if (permission === 'denied') throw new Error('Motion permission denied.');
    this.diagnostic.permissions.shake = permission;
    let lastAt = 0;
    const onMotion = (event) => {
      const a = event.acceleration || event.accelerationIncludingGravity;
      if (a?.x == null || a?.y == null || a?.z == null) return;
      let magnitude = Math.hypot(a.x, a.y, a.z);
      if (!event.acceleration && event.accelerationIncludingGravity) magnitude = Math.abs(magnitude - 9.81);
      this.#sensor({ type: 'shake', magnitude: +magnitude.toFixed(2) });
      if (magnitude < 7 || Date.now() - lastAt < this.options.shakeCooldown) return;
      lastAt = Date.now();
      this.#emit('device_shaken', clamp(magnitude / 28));
    };
    if (permission !== 'needs-tap') {
      addEventListener('devicemotion', onMotion, true);
      this.cleanups.set('shake', () => removeEventListener('devicemotion', onMotion, true));
      return;
    }
    let attached = false;
    const stopAsk = onEveryGesture(() => {
      if (attached) return;
      requestEventPermission(globalThis.DeviceMotionEvent).then((result) => {
        if (attached || (result !== 'granted' && result !== 'not-required') || !this.cleanups.has('shake')) return;
        attached = true;
        stopAsk();
        this.diagnostic.permissions.shake = result;
        addEventListener('devicemotion', onMotion, true);
      }).catch(() => {});
    });
    this.cleanups.set('shake', () => { stopAsk(); removeEventListener('devicemotion', onMotion, true); });
  }

  enableTouch(element = document.documentElement) {
    if (this.cleanups.has('touch')) return;
    if (!this.capabilities().touch) throw new Error('Pointer events are unavailable.');
    // Hark patch: iOS starts text selection on a long press and cancels pointer events,
    // so the old pointerup check never fired. Use touch events + a timer: still held
    // after HOLD_MS without moving = long press.
    const HOLD_MS = 500;
    let state = null;
    let lastAt = 0;
    const clear = () => { if (state?.timer) clearTimeout(state.timer); state = null; };
    const fire = () => {
      if (!state) return;
      const duration = performance.now() - state.at;
      state.timer = 0;
      if (Date.now() - lastAt < 3000) return;
      lastAt = Date.now();
      this.#emit('screen_touched', Math.max(0.3, clamp(state.force || 0)), { gesture: 'long_press', duration_ms: Math.round(duration) });
    };
    const start = (event) => {
      clear();
      if (event.touches && event.touches.length !== 1) return;
      const t = event.touches ? event.touches[0] : event;
      state = { at: performance.now(), x: t.clientX, y: t.clientY, force: t.force || 0, timer: 0 };
      state.timer = setTimeout(fire, HOLD_MS);
    };
    const move = (event) => {
      if (!state) return;
      const t = event.touches ? event.touches[0] : event;
      if (!t) return;
      state.force = Math.max(state.force, t.force || 0);
      if (Math.hypot(t.clientX - state.x, t.clientY - state.y) > 14) clear();
    };
    const hasTouch = 'ontouchstart' in globalThis;
    const types = hasTouch
      ? [['touchstart', start], ['touchmove', move], ['touchend', clear], ['touchcancel', clear]]
      : [['pointerdown', (e) => { if (e.pointerType === 'touch') start(e); }], ['pointermove', move], ['pointerup', clear], ['pointercancel', clear]];
    types.forEach(([type, fn]) => element.addEventListener(type, fn, { passive: true }));
    this.cleanups.set('touch', () => {
      clear();
      types.forEach(([type, fn]) => element.removeEventListener(type, fn));
    });
  }

  capturePhoto({ camera = 'rear', accept = 'image/*' } = {}) {
    if (!this.capabilities().cameraPicker) return Promise.reject(new Error('Camera file picker is unavailable.'));
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.capture = camera === 'front' ? 'user' : 'environment';
      input.hidden = true;
      input.addEventListener('change', () => {
        const file = input.files?.[0] || null;
        input.remove();
        resolve(file);
      }, { once: true });
      document.body.appendChild(input);
      input.click();
    });
  }

  #emit(event, strength, detail = {}) {
    const payload = {
      type: 'sensor_event',
      event,
      strength: +clamp(strength).toFixed(2),
      timestamp: Date.now(),
      ...detail
    };
    this.diagnostic.event = { ...payload, at: nowIso(), localOnly: this.localOnly };
    this.#diagnose();
    this.dispatchEvent(new CustomEvent('sense', { detail: payload }));
    if (!this.localOnly) this.options.onEvent?.(payload);
  }

  #sensor(value) {
    this.diagnostic.sensor = value;
    this.#diagnose(false);
  }

  #diagnose(force = true) {
    if (!force && Date.now() - this.lastDiagnosticDispatch < 100) return;
    this.lastDiagnosticDispatch = Date.now();
    this.dispatchEvent(new CustomEvent('diagnostic', { detail: this.report() }));
    if (force) this.options.onDiagnostic?.(this.report());
  }
}
