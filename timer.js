/* ===== Kraftlog — Signal-Primitiven für den Pausen-Timer =====
 * Die Countdown-Logik lebt in app.js (rein timestampbasiert, Date.now() vs. gespeicherte Epochen).
 * Hier nur: Web-Audio-Piepton + Vibration.
 * iOS-Besonderheit: AudioContext startet gesperrt und muss in einer Nutzer-Geste
 * entsperrt werden → unlock() wird beim ersten ✓-Tap aufgerufen.
 */
window.KraftlogTimer = (function () {
  'use strict';

  let ctx = null;

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { try { ctx = new AC(); } catch (e) { ctx = null; } }
    }
    return ctx;
  }

  /* In einer Nutzer-Geste aufrufen (erster ✓-Tap): resume + stiller Puffer entsperren iOS-Audio. */
  function unlock() {
    const c = ensureCtx();
    if (!c) return;
    try {
      if (c.state === 'suspended') c.resume();
      const buf = c.createBuffer(1, 1, 22050);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.start(0);
    } catch (e) { /* Audio bleibt gesperrt → Vibration/visueller Fallback */ }
  }

  /* 3 × 880-Hz-Piepton. Rückgabe false, wenn Audio nicht verfügbar/gesperrt. */
  function beep() {
    const c = ensureCtx();
    if (!c || c.state !== 'running') return false;
    try {
      let t = c.currentTime + 0.02;
      for (let i = 0; i < 3; i++) {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        osc.connect(gain).connect(c.destination);
        osc.start(t);
        osc.stop(t + 0.18);
        t += 0.3;
      }
      return true;
    } catch (e) { return false; }
  }

  /* Vibration, wo unterstützt (Android; iOS-Safari ignoriert es). */
  function vibrate() {
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { }
  }

  return { unlock, beep, vibrate };
})();
