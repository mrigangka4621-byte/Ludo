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
