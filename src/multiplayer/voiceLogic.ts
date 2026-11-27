import type { OnlineSeat } from './protocol.ts';

export const DEFAULT_SPEAK_START_THRESHOLD = 0.032;
export const DEFAULT_SPEAK_STOP_THRESHOLD = 0.018;
export const DEFAULT_SPEAK_HOLD_MS = 280;

/**
 * Compute normalized RMS amplitude [0..1] from Web Audio AnalyserNode time-domain bytes
 * (128 represents digital silence).
 */
export function computeRmsLevel(timeDomainBytes: ArrayLike<number>): number {
  const len = timeDomainBytes.length;
  if (len === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < len; i++) {
    const centered = (timeDomainBytes[i] - 128) / 128;
    sumSq += centered * centered;
  }
  return Math.min(1, Math.sqrt(sumSq / len));
}

/**
 * Voice Activity Detection (VAD) with start/stop hysteresis and short hold window
 * so speaking indicators stay steady across natural speech syllables without flickering.
 */
export function evaluateSpeakingState(params: {
  prevSpeaking: boolean;
  rms: number;
  nowMs: number;
  lastAboveStopMs: number;
  startThreshold?: number;
  stopThreshold?: number;
  holdMs?: number;
}): { speaking: boolean; lastAboveStopMs: number } {
  const startThreshold = params.startThreshold ?? DEFAULT_SPEAK_START_THRESHOLD;
  const stopThreshold = params.stopThreshold ?? DEFAULT_SPEAK_STOP_THRESHOLD;
  const holdMs = params.holdMs ?? DEFAULT_SPEAK_HOLD_MS;

  if (params.rms >= startThreshold) {
    return { speaking: true, lastAboveStopMs: params.nowMs };
  }

  if (params.prevSpeaking) {
    if (params.rms >= stopThreshold) {
      return { speaking: true, lastAboveStopMs: params.nowMs };
    }
    if (params.nowMs - params.lastAboveStopMs < holdMs) {
      return { speaking: true, lastAboveStopMs: params.lastAboveStopMs };
    }
  }

  return { speaking: false, lastAboveStopMs: params.lastAboveStopMs };
}

/**
 * Deterministic WebRTC offer initiator tie-breaker to prevent simultaneous offer glare
 * when two players join room voice chat at the same moment.
 */
export function shouldInitiateWebRtcOffer(
  localClientId: string,
  remoteClientId: string
): boolean {
  if (!localClientId || !remoteClientId || localClientId === remoteClientId) return false;
  return localClientId < remoteClientId;
}

/**
 * Return connected remote peer client IDs currently active in the room's voice channel.
 */
export function getActiveVoicePeerIds(
  seats: OnlineSeat[],
  localClientId: string
): string[] {
  const peers: string[] = [];
  for (const seat of seats) {
    if (
      seat.clientId !== localClientId &&
      seat.connected &&
      seat.voiceJoined === true
    ) {
      peers.push(seat.clientId);
    }
  }
  return peers;
}

const MULAW_BIAS = 0x84;
const MULAW_MAX = 32635;

/**
 * Standard ITU-T G.711 u-law 8-bit speech encoder ([-1, 1] float -> 0..255 byte).
 * Gives crisp telephony-grade voice at 1 byte/sample (12 KB/s at 12 kHz).
 */
export function encodeMuLawSample(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  let pcm = Math.round(clamped * 32767);
  let sign = 0;
  if (pcm < 0) {
    sign = 0x80;
    pcm = -pcm;
  }
  if (pcm > MULAW_MAX) pcm = MULAW_MAX;
  pcm += MULAW_BIAS;

  let exponent = 7;
  for (let expMask = 0x4000; (pcm & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent--;
  }
  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}

/**
 * Standard ITU-T G.711 u-law 8-bit speech decoder (0..255 byte -> [-1, 1] float).
 */
export function decodeMuLawSample(byte: number): number {
  const u = (~byte) & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let pcm = ((mantissa << 3) + MULAW_BIAS) << exponent;
  pcm -= MULAW_BIAS;
  const signed = sign ? -pcm : pcm;
  return Math.max(-1, Math.min(1, signed / 32768));
}

/**
 * Compute RMS amplitude [0..1] from float PCM samples in [-1..1].
 */
export function computeFloatRmsLevel(samples: ArrayLike<number>): number {
  const len = samples.length;
  if (len === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < len; i++) {
    const v = samples[i];
    sumSq += v * v;
  }
  return Math.min(1, Math.sqrt(sumSq / len));
}

/**
 * Downsample float PCM buffer from inputSampleRate to targetSampleRate using box-filter
 * averaging (prevents aliasing) and encode each sample to 8-bit u-law.
 */
export function downsampleAndEncodeMuLaw(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 12000
): Uint8Array {
  if (input.length === 0) return new Uint8Array(0);
  if (inputSampleRate <= targetSampleRate) {
    const out = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) {
      out[i] = encodeMuLawSample(input[i]);
    }
    return out;
  }
  const ratio = inputSampleRate / targetSampleRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Uint8Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j];
      count++;
    }
    out[i] = encodeMuLawSample(count > 0 ? sum / count : 0);
  }
  return out;
}

/**
 * Decode an 8-bit u-law byte array back into Float32 PCM samples for Web Audio playback.
 */
export function decodeMuLawToFloat32(bytes: Uint8Array): Float32Array {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = decodeMuLawSample(bytes[i]);
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  let binary = '';
  const chunk = 0x4000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + chunk));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(b64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
