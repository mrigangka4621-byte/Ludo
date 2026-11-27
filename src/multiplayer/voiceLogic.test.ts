import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRmsLevel,
  evaluateSpeakingState,
  getActiveVoicePeerIds,
  shouldInitiateWebRtcOffer,
} from './voiceLogic.ts';
import type { OnlineSeat } from './protocol.ts';

test('computeRmsLevel returns 0 for silence (128) and rises cleanly for active audio waves', () => {
  const silent = new Uint8Array(64).fill(128);
  assert.equal(computeRmsLevel(silent), 0);

  const loud = new Uint8Array(64);
  for (let i = 0; i < loud.length; i++) {
    loud[i] = i % 2 === 0 ? 192 : 64;
  }
  const rms = computeRmsLevel(loud);
  assert.ok(rms > 0.45 && rms <= 0.55, `Expected ~0.5 RMS, got ${rms}`);
});

test('evaluateSpeakingState applies start/stop hysteresis and hold window cleanly', () => {
  // Below start threshold -> stays silent
  const r1 = evaluateSpeakingState({
    prevSpeaking: false,
    rms: 0.02,
    nowMs: 1000,
    lastAboveStopMs: 0,
  });
  assert.equal(r1.speaking, false);

  // Above start threshold -> starts speaking
  const r2 = evaluateSpeakingState({
    prevSpeaking: false,
    rms: 0.08,
    nowMs: 1100,
    lastAboveStopMs: 0,
  });
  assert.equal(r2.speaking, true);
  assert.equal(r2.lastAboveStopMs, 1100);

  // Brief dip below stop threshold within holdMs (280ms) -> stays speaking smoothly
  const r3 = evaluateSpeakingState({
    prevSpeaking: true,
    rms: 0.005,
    nowMs: 1250,
    lastAboveStopMs: r2.lastAboveStopMs,
  });
  assert.equal(r3.speaking, true);

  // Quiet past hold window -> cleanly turns off speaking indicator
  const r4 = evaluateSpeakingState({
    prevSpeaking: true,
    rms: 0.005,
    nowMs: 1450,
    lastAboveStopMs: r2.lastAboveStopMs,
  });
  assert.equal(r4.speaking, false);
});

test('shouldInitiateWebRtcOffer is strictly asymmetric for any two distinct client IDs', () => {
  assert.equal(shouldInitiateWebRtcOffer('client-a', 'client-b'), true);
  assert.equal(shouldInitiateWebRtcOffer('client-b', 'client-a'), false);
  assert.equal(shouldInitiateWebRtcOffer('client-a', 'client-a'), false);
});

test('getActiveVoicePeerIds returns only connected remote peers who joined voice', () => {
  const seats: OnlineSeat[] = [
    { seatIndex: 0, clientId: 'me', name: 'Me', connected: true, isHost: true, paletteIndex: 0, voiceJoined: true },
    { seatIndex: 1, clientId: 'p2', name: 'Alice', connected: true, isHost: false, paletteIndex: 1, voiceJoined: true },
    { seatIndex: 2, clientId: 'p3', name: 'Bob', connected: true, isHost: false, paletteIndex: 2, voiceJoined: false },
    { seatIndex: 3, clientId: 'p4', name: 'Cara', connected: false, isHost: false, paletteIndex: 3, voiceJoined: true },
  ];
  assert.deepEqual(getActiveVoicePeerIds(seats, 'me'), ['p2']);
});
