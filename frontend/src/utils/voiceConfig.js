// Shared voice configuration: ICE servers, bitrate, localStorage keys, helpers

export const getNoiseSuppressorWorkletUrl = () =>
  (typeof import.meta !== 'undefined' && import.meta.env?.DEV)
    ? new URL('../audio/noise-suppressor-worklet.js', import.meta.url).href
    : `${typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : '/'}assets/noise-suppressor-worklet.js`;

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

export const AUDIO_BITRATE = 64000;

export const VOICE_KEYS = {
  inputDeviceId: 'rucord_voice_input_device',
  outputDeviceId: 'rucord_voice_output_device',
  inputGain: 'rucord_voice_input_gain',
  outputGain: 'rucord_voice_output_gain',
  sensitivityAuto: 'rucord_voice_sensitivity_auto',
  sensitivityThreshold: 'rucord_voice_sensitivity_threshold',
  muted: 'rucord_voice_panel_muted',
  deafened: 'rucord_voice_panel_deafened',
  noiseSuppression: 'rucord_voice_noise_suppression'
};

export function loadNumber(key, def) {
  try {
    const v = localStorage.getItem(key);
    if (v != null) { const n = parseFloat(v); if (!Number.isNaN(n)) return n; }
  } catch (e) {}
  return def;
}

export function saveNumber(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (e) {}
}

export function loadString(key, def) {
  try { const v = localStorage.getItem(key); return v != null ? v : def; } catch (e) {}
  return def;
}

export function saveString(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (e) {}
}

export function loadBool(key, def) {
  try {
    const v = localStorage.getItem(key);
    return v === 'true' ? true : v === 'false' ? false : def;
  } catch (e) {}
  return def;
}

export function saveBool(key, value) {
  try { localStorage.setItem(key, value ? 'true' : 'false'); } catch (e) {}
}

export function setAudioBitrate(pc, maxBitrate = AUDIO_BITRATE) {
  pc.getSenders().forEach(sender => {
    if (sender.track?.kind === 'audio') {
      const params = sender.getParameters();
      if (!params.encodings) params.encodings = [{}];
      params.encodings[0].maxBitrate = maxBitrate;
      sender.setParameters(params).catch(() => {});
    }
  });
}

export function getSpeakThreshold() {
  try {
    const auto = localStorage.getItem(VOICE_KEYS.sensitivityAuto);
    if (auto === 'true') return 25;
    const t = localStorage.getItem(VOICE_KEYS.sensitivityThreshold);
    if (t != null) {
      const n = parseInt(t, 10);
      if (!Number.isNaN(n) && n >= 0 && n <= 100) return Math.max(1, Math.round((n / 100) * 80));
    }
  } catch (e) {}
  return 25;
}

// Dispatch a synthetic storage event so same-window listeners can react
export function notifyStorageChange(key) {
  window.dispatchEvent(new StorageEvent('storage', { key }));
}
