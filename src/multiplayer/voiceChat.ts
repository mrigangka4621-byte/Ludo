import type { OnlineSeat, VoiceSignalPayload } from './protocol';
import {
  base64ToBytes,
  bytesToBase64,
  computeFloatRmsLevel,
  computeRmsLevel,
  decodeMuLawToFloat32,
  downsampleAndEncodeMuLaw,
  evaluateSpeakingState,
  getActiveVoicePeerIds,
  shouldInitiateWebRtcOffer,
} from './voiceLogic';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
};

const RELAY_SAMPLE_RATE = 12000;
const RELAY_FALLBACK_DELAY_MS = 1800;
const RELAY_VAD_SEND_RMS = 0.01;
const RELAY_SPEAK_DECAY_MS = 340;

export type VoiceTransportMode = 'idle' | 'connecting' | 'p2p' | 'relay';

export interface VoiceUiSnapshot {
  joined: boolean;
  joining: boolean;
  muted: boolean;
  deafened: boolean;
  localSpeaking: boolean;
  error: string | null;
  activePeerCount: number;
  transportMode: VoiceTransportMode;
}

interface VoiceManagerCallbacks {
  sendVoiceState: (joined: boolean, muted: boolean, speaking: boolean) => void;
  sendVoiceSignal: (targetClientId: string, signal: VoiceSignalPayload) => void;
  sendVoiceAudio: (targetClientIds: string[], sampleRate: number, data: string) => void;
  onSnapshot: (snapshot: VoiceUiSnapshot) => void;
  onPeerSpeakingLocalDetect?: (clientId: string, speaking: boolean) => void;
}

interface PeerEntry {
  pc: RTCPeerConnection | null;
  audioEl: HTMLAudioElement;
  pendingIce: RTCIceCandidateInit[];
  remoteDescriptionSet: boolean;
  createdAtMs: number;
  restartedIceOnce: boolean;
  analyser?: AnalyserNode;
  analyserData?: Uint8Array<ArrayBuffer>;
  sourceNode?: MediaStreamAudioSourceNode;
  speaking: boolean;
  lastAboveStopMs: number;
  nextRelayPlayTime: number;
  lastRelayReceivedMs: number;
}

/**
 * Reliable room voice chat manager (zero database or external TURN server required):
 * - Primary: WebRTC P2P mesh with DOM-mounted audio rack, gesture autoplay unlock,
 *   early-offer buffering, polite-peer glare rollback, and ICE restart.
 * - Automatic Fallback: Low-latency G.711 u-law 12 kHz WebSocket audio relay
 *   whenever P2P cannot punch through symmetric NAT / 4G / 5G / Cloud Run firewalls.
 */
export class RoomVoiceManager {
  private readonly localClientId: string;
  private readonly callbacks: VoiceManagerCallbacks;

  private localStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private localSource: MediaStreamAudioSourceNode | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localAnalyserData: Uint8Array<ArrayBuffer> | null = null;
  private relayProcessor: ScriptProcessorNode | null = null;
  private relayMuteGain: GainNode | null = null;
  private vadTimer: number | null = null;
  private audioRackEl: HTMLDivElement | null = null;
  private unlockBound = false;

  private peers = new Map<string, PeerEntry>();
  private latestSeats: OnlineSeat[] = [];
  private pendingEarlySignals: Array<{ fromClientId: string; signal: VoiceSignalPayload }> = [];

  private joined = false;
  private joining = false;
  private muted = false;
  private deafened = false;
  private localSpeaking = false;
  private localLastAboveStopMs = 0;
  private error: string | null = null;

  constructor(localClientId: string, callbacks: VoiceManagerCallbacks) {
    this.localClientId = localClientId;
    this.callbacks = callbacks;
  }

  isJoined(): boolean {
    return this.joined;
  }

  private computeTransportMode(): VoiceTransportMode {
    if (!this.joined) return 'idle';
    if (this.peers.size === 0) return 'idle';
    let anyP2p = false;
    let anyRelay = false;
    const now = performance.now();
    for (const entry of this.peers.values()) {
      if (entry.pc?.connectionState === 'connected') {
        anyP2p = true;
      } else if (
        !entry.pc ||
        entry.pc.connectionState === 'failed' ||
        entry.pc.iceConnectionState === 'failed' ||
        now - entry.createdAtMs >= RELAY_FALLBACK_DELAY_MS ||
        now - entry.lastRelayReceivedMs < 4000
      ) {
        anyRelay = true;
      }
    }
    if (anyP2p && !anyRelay) return 'p2p';
    if (anyRelay) return 'relay';
    return 'connecting';
  }

  getSnapshot(): VoiceUiSnapshot {
    return {
      joined: this.joined,
      joining: this.joining,
      muted: this.muted,
      deafened: this.deafened,
      localSpeaking: this.localSpeaking,
      error: this.error,
      activePeerCount: this.peers.size,
      transportMode: this.computeTransportMode(),
    };
  }

  private emitSnapshot() {
    this.callbacks.onSnapshot(this.getSnapshot());
  }

  private ensureAudioRack(): HTMLDivElement | null {
    if (typeof document === 'undefined' || !document.body) return null;
    if (this.audioRackEl && this.audioRackEl.isConnected) return this.audioRackEl;
    const el = document.createElement('div');
    el.setAttribute('data-mango-voice-rack', 'true');
    el.style.display = 'none';
    document.body.appendChild(el);
    this.audioRackEl = el;
    return el;
  }

  private removeAudioRack() {
    if (this.audioRackEl) {
      this.audioRackEl.remove();
      this.audioRackEl = null;
    }
  }

  private handleUserGestureUnlock = () => {
    if (!this.joined) return;
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume().catch(() => {});
    }
    for (const entry of this.peers.values()) {
      if (entry.audioEl.srcObject && entry.audioEl.paused && !this.deafened) {
        void entry.audioEl.play().catch(() => {});
      }
    }
  };

  private bindUnlockListeners() {
    if (typeof window === 'undefined' || this.unlockBound) return;
    window.addEventListener('pointerdown', this.handleUserGestureUnlock, { passive: true });
    window.addEventListener('keydown', this.handleUserGestureUnlock, { passive: true });
    this.unlockBound = true;
  }

  private unbindUnlockListeners() {
    if (typeof window === 'undefined' || !this.unlockBound) return;
    window.removeEventListener('pointerdown', this.handleUserGestureUnlock);
    window.removeEventListener('keydown', this.handleUserGestureUnlock);
    this.unlockBound = false;
  }

  async joinVoice(seats: OnlineSeat[]): Promise<boolean> {
    this.latestSeats = seats;
    if (this.joined || this.joining) return this.joined;

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      this.error = 'Microphone is not supported in this browser.';
      this.emitSnapshot();
      return false;
    }

    this.joining = true;
    this.error = null;
    this.pendingEarlySignals = [];
    this.emitSnapshot();

    // Create/resume AudioContext immediately inside the user gesture before awaiting getUserMedia
    const ctx = this.ensureAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      this.localStream = stream;
      this.joined = true;
      this.joining = false;
      this.muted = false;
      this.localSpeaking = false;
      this.localLastAboveStopMs = 0;
      this.error = null;

      this.ensureAudioRack();
      this.bindUnlockListeners();
      this.setupLocalAudioPipeline(stream);
      this.callbacks.sendVoiceState(true, false, false);
      this.syncPeers(this.latestSeats);

      // Flush any offers/ICE candidates that arrived while getUserMedia prompt was open
      if (this.pendingEarlySignals.length > 0) {
        const queued = this.pendingEarlySignals.splice(0, this.pendingEarlySignals.length);
        for (const item of queued) {
          void this.handleSignal(item.fromClientId, item.signal);
        }
      }

      this.emitSnapshot();
      return true;
    } catch (err) {
      this.joining = false;
      this.joined = false;
      this.pendingEarlySignals = [];
      const errName = err instanceof Error ? err.name : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        this.error = 'Microphone access denied. Allow mic permission in your browser to talk.';
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        this.error = 'No microphone detected on this device.';
      } else {
        this.error = 'Could not start microphone. Check your audio settings and try again.';
      }
      this.emitSnapshot();
      return false;
    }
  }

  /**
   * Re-announce current voice state to the server after a WebSocket reconnect
   * or room transition so all peers stay synchronized in the voice channel.
   */
  reannounceState(seats?: OnlineSeat[]) {
    if (seats) {
      this.latestSeats = seats;
    }
    if (!this.joined || !this.localStream) return;
    this.callbacks.sendVoiceState(true, this.muted, this.localSpeaking);
    this.syncPeers(this.latestSeats);
    this.emitSnapshot();
  }

  leaveVoice(notifyServer = true) {
    const wasJoined = this.joined;
    this.joined = false;
    this.joining = false;
    this.muted = false;
    this.deafened = false;
    this.localSpeaking = false;
    this.error = null;
    this.pendingEarlySignals = [];

    this.unbindUnlockListeners();

    if (this.vadTimer !== null) {
      window.clearInterval(this.vadTimer);
      this.vadTimer = null;
    }

    for (const peerId of Array.from(this.peers.keys())) {
      this.closePeer(peerId);
    }

    if (this.relayProcessor) {
      this.relayProcessor.onaudioprocess = null;
      try {
        this.relayProcessor.disconnect();
      } catch {
        // ignore
      }
      this.relayProcessor = null;
    }

    if (this.relayMuteGain) {
      try {
        this.relayMuteGain.disconnect();
      } catch {
        // ignore
      }
      this.relayMuteGain = null;
    }

    if (this.localSource) {
      try {
        this.localSource.disconnect();
      } catch {
        // ignore
      }
      this.localSource = null;
    }
    this.localAnalyser = null;
    this.localAnalyserData = null;

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }

    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    this.removeAudioRack();

    if (notifyServer && wasJoined) {
      this.callbacks.sendVoiceState(false, false, false);
    }
    this.emitSnapshot();
  }

  toggleMute(): boolean {
    if (!this.joined || !this.localStream) return this.muted;
    this.muted = !this.muted;
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !this.muted;
    }
    if (this.muted && this.localSpeaking) {
      this.localSpeaking = false;
    }
    this.callbacks.sendVoiceState(true, this.muted, this.localSpeaking);
    this.emitSnapshot();
    return this.muted;
  }

  toggleDeafen(): boolean {
    this.deafened = !this.deafened;
    for (const entry of this.peers.values()) {
      entry.audioEl.muted = this.deafened;
      if (!this.deafened && entry.audioEl.srcObject && entry.audioEl.paused) {
        void entry.audioEl.play().catch(() => {});
      }
    }
    this.emitSnapshot();
    return this.deafened;
  }

  clearError() {
    if (this.error !== null) {
      this.error = null;
      this.emitSnapshot();
    }
  }

  syncPeers(seats: OnlineSeat[]) {
    this.latestSeats = seats;
    if (!this.joined || !this.localStream) return;

    const desiredPeers = new Set(getActiveVoicePeerIds(seats, this.localClientId));

    // Close connections for peers who left voice or disconnected
    for (const peerId of Array.from(this.peers.keys())) {
      if (!desiredPeers.has(peerId)) {
        this.closePeer(peerId);
      }
    }

    // Create connections for newly joined voice peers
    for (const peerId of desiredPeers) {
      if (!this.peers.has(peerId)) {
        const entry = this.createPeerConnection(peerId);
        if (entry && entry.pc && shouldInitiateWebRtcOffer(this.localClientId, peerId)) {
          void this.initiateOffer(peerId, entry);
        }
      }
    }

    this.emitSnapshot();
  }

  async handleSignal(fromClientId: string, signal: VoiceSignalPayload) {
    if (fromClientId === this.localClientId) return;

    // Buffer offers/ICE candidates that arrive while user is clicking "Allow Mic"
    if (this.joining) {
      if (this.pendingEarlySignals.length < 40) {
        this.pendingEarlySignals.push({ fromClientId, signal });
      }
      return;
    }

    if (!this.joined || !this.localStream) return;

    let entry = this.peers.get(fromClientId);
    if (!entry) {
      entry = this.createPeerConnection(fromClientId);
      if (!entry) return;
    }
    const pc = entry.pc;
    if (!pc) return;

    const isPolite = this.localClientId > fromClientId;

    try {
      if (signal.kind === 'offer') {
        if (pc.signalingState !== 'stable') {
          if (!isPolite) {
            return;
          }
          try {
            await pc.setLocalDescription({ type: 'rollback' });
          } catch {
            // ignore rollback if unsupported
          }
        }
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        entry.remoteDescriptionSet = true;
        await this.flushPendingIce(entry);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (answer.sdp) {
          this.callbacks.sendVoiceSignal(fromClientId, {
            kind: 'answer',
            sdp: { type: 'answer', sdp: answer.sdp },
          });
        }
      } else if (signal.kind === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          entry.remoteDescriptionSet = true;
          await this.flushPendingIce(entry);
        }
      } else if (signal.kind === 'ice') {
        if (entry.remoteDescriptionSet) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          entry.pendingIce.push(signal.candidate);
        }
      }
    } catch {
      // Relay fallback automatically covers any negotiation edge case
    }
  }

  /**
   * Handle incoming server-relayed u-law audio chunk from a peer whose P2P
   * WebRTC link is still connecting or blocked by symmetric NAT/firewall.
   */
  handleVoiceAudio(fromClientId: string, sampleRate: number, base64Data: string) {
    if (!this.joined || this.deafened) return;
    if (fromClientId === this.localClientId) return;

    let entry = this.peers.get(fromClientId);
    if (!entry) {
      // Ensure peer entry exists even if room:update raced slightly behind audio packet
      entry = this.createPeerConnection(fromClientId);
      if (!entry) return;
    }

    // If WebRTC P2P is already connected for this peer, skip relay audio to avoid echo/double audio
    if (entry.pc?.connectionState === 'connected') {
      return;
    }

    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    try {
      const bytes = base64ToBytes(base64Data);
      if (bytes.length === 0) return;
      const samples = decodeMuLawToFloat32(bytes);
      const validRate = Math.max(6000, Math.min(48000, Math.round(sampleRate || RELAY_SAMPLE_RATE)));

      const buffer = ctx.createBuffer(1, samples.length, validRate);
      buffer.getChannelData(0).set(samples);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);

      const nowAudio = ctx.currentTime;
      // Tight jitter buffer: schedule smoothly back-to-back, snapping forward if fallen behind
      if (entry.nextRelayPlayTime < nowAudio + 0.015 || entry.nextRelayPlayTime > nowAudio + 0.45) {
        entry.nextRelayPlayTime = nowAudio + 0.03;
      }
      src.start(entry.nextRelayPlayTime);
      entry.nextRelayPlayTime += buffer.duration;

      const nowMs = performance.now();
      entry.lastRelayReceivedMs = nowMs;

      // Drive remote speaking indicator immediately from decoded relay audio RMS
      const rms = computeFloatRmsLevel(samples);
      const next = evaluateSpeakingState({
        prevSpeaking: entry.speaking,
        rms,
        nowMs,
        lastAboveStopMs: entry.lastAboveStopMs,
      });
      entry.lastAboveStopMs = next.lastAboveStopMs;
      if (next.speaking !== entry.speaking) {
        entry.speaking = next.speaking;
        this.callbacks.onPeerSpeakingLocalDetect?.(fromClientId, entry.speaking);
      }
    } catch {
      // Ignore malformed audio chunk gracefully
    }
  }

  private async flushPendingIce(entry: PeerEntry) {
    if (!entry.pc) return;
    while (entry.pendingIce.length > 0) {
      const candidate = entry.pendingIce.shift()!;
      try {
        await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // ignore stale candidate
      }
    }
  }

  private createPeerConnection(peerId: string): PeerEntry | undefined {
    if (!this.localStream) return undefined;

    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.setAttribute('playsinline', 'true');
    audioEl.muted = this.deafened;
    const rack = this.ensureAudioRack();
    if (rack) {
      rack.appendChild(audioEl);
    }

    const pc = typeof RTCPeerConnection !== 'undefined' ? new RTCPeerConnection(RTC_CONFIG) : null;

    const entry: PeerEntry = {
      pc,
      audioEl,
      pendingIce: [],
      remoteDescriptionSet: false,
      createdAtMs: performance.now(),
      restartedIceOnce: false,
      speaking: false,
      lastAboveStopMs: 0,
      nextRelayPlayTime: 0,
      lastRelayReceivedMs: 0,
    };

    if (pc) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          this.callbacks.sendVoiceSignal(peerId, {
            kind: 'ice',
            candidate: {
              candidate: ev.candidate.candidate,
              sdpMid: ev.candidate.sdpMid,
              sdpMLineIndex: ev.candidate.sdpMLineIndex,
              usernameFragment: ev.candidate.usernameFragment,
            },
          });
        }
      };

      pc.ontrack = (ev) => {
        const remoteStream = ev.streams[0] ?? new MediaStream([ev.track]);
        entry.audioEl.srcObject = remoteStream;
        entry.audioEl.muted = this.deafened;
        entry.audioEl.play().catch(() => {
          // Will unlock on next pointerdown/keydown via gesture listener
        });
        this.attachRemoteVad(entry, remoteStream);
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected' && !entry.restartedIceOnce) {
          entry.restartedIceOnce = true;
          try {
            pc.restartIce?.();
          } catch {
            // ignore
          }
        }
        this.emitSnapshot();
      };

      pc.onconnectionstatechange = () => {
        this.emitSnapshot();
      };
    }

    this.peers.set(peerId, entry);
    return entry;
  }

  private async initiateOffer(peerId: string, entry: PeerEntry) {
    if (!entry.pc) return;
    try {
      const offer = await entry.pc.createOffer();
      await entry.pc.setLocalDescription(offer);
      if (offer.sdp) {
        this.callbacks.sendVoiceSignal(peerId, {
          kind: 'offer',
          sdp: { type: 'offer', sdp: offer.sdp },
        });
      }
    } catch {
      // ignore negotiation abort
    }
  }

  private closePeer(peerId: string) {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    this.peers.delete(peerId);

    if (entry.speaking) {
      this.callbacks.onPeerSpeakingLocalDetect?.(peerId, false);
    }
    try {
      entry.sourceNode?.disconnect();
    } catch {
      // ignore
    }
    try {
      entry.pc?.close();
    } catch {
      // ignore
    }
    entry.audioEl.pause();
    entry.audioEl.srcObject = null;
    entry.audioEl.remove();
  }

  private ensureAudioContext(): AudioContext | null {
    if (this.audioCtx) return this.audioCtx;
    const AudioCtxCtor =
      typeof window !== 'undefined'
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!AudioCtxCtor) return null;
    try {
      this.audioCtx = new AudioCtxCtor();
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  private setupLocalAudioPipeline(stream: MediaStream) {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;

    try {
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      this.localSource = source;
      this.localAnalyser = analyser;
      this.localAnalyserData = new Uint8Array(new ArrayBuffer(analyser.fftSize));

      // Lightweight silent capture node for automatic WebSocket u-law relay fallback
      if (typeof ctx.createScriptProcessor === 'function') {
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        const silentGain = ctx.createGain();
        silentGain.gain.value = 0;

        processor.onaudioprocess = (ev) => {
          if (!this.joined || this.muted || this.peers.size === 0) return;

          const now = performance.now();
          const relayTargets: string[] = [];
          for (const [peerId, entry] of this.peers.entries()) {
            const p2pConnected = entry.pc?.connectionState === 'connected';
            if (p2pConnected) continue;
            const p2pFailed =
              !entry.pc ||
              entry.pc.connectionState === 'failed' ||
              entry.pc.iceConnectionState === 'failed';
            if (p2pFailed || now - entry.createdAtMs >= RELAY_FALLBACK_DELAY_MS) {
              relayTargets.push(peerId);
            }
          }
          if (relayTargets.length === 0) return;

          const input = ev.inputBuffer.getChannelData(0);
          const rms = computeFloatRmsLevel(input);
          if (!this.localSpeaking && rms < RELAY_VAD_SEND_RMS) return;

          const encoded = downsampleAndEncodeMuLaw(input, ctx.sampleRate, RELAY_SAMPLE_RATE);
          if (encoded.length === 0) return;
          const b64 = bytesToBase64(encoded);
          this.callbacks.sendVoiceAudio(relayTargets, RELAY_SAMPLE_RATE, b64);
        };

        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(ctx.destination);
        this.relayProcessor = processor;
        this.relayMuteGain = silentGain;
      }

      if (this.vadTimer !== null) window.clearInterval(this.vadTimer);
      // Sample audio levels at ~12Hz (smooth, responsive, negligible CPU)
      this.vadTimer = window.setInterval(() => {
        this.pollAudioLevels();
      }, 85);
    } catch {
      // Fallback safely if AudioContext fails
    }
  }

  private attachRemoteVad(entry: PeerEntry, remoteStream: MediaStream) {
    const ctx = this.ensureAudioContext();
    if (!ctx || entry.analyser) return;
    try {
      const source = ctx.createMediaStreamSource(remoteStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      entry.sourceNode = source;
      entry.analyser = analyser;
      entry.analyserData = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    } catch {
      // ignore remote VAD errors
    }
  }

  private pollAudioLevels() {
    const now = performance.now();

    // 1. Local microphone VAD
    if (this.joined && this.localAnalyser && this.localAnalyserData) {
      if (this.muted) {
        if (this.localSpeaking) {
          this.localSpeaking = false;
          this.callbacks.sendVoiceState(true, true, false);
          this.emitSnapshot();
        }
      } else {
        this.localAnalyser.getByteTimeDomainData(this.localAnalyserData);
        const rms = computeRmsLevel(this.localAnalyserData);
        const next = evaluateSpeakingState({
          prevSpeaking: this.localSpeaking,
          rms,
          nowMs: now,
          lastAboveStopMs: this.localLastAboveStopMs,
        });
        this.localLastAboveStopMs = next.lastAboveStopMs;
        if (next.speaking !== this.localSpeaking) {
          this.localSpeaking = next.speaking;
          this.callbacks.sendVoiceState(true, false, this.localSpeaking);
          this.emitSnapshot();
        }
      }
    }

    // 2. Remote peer audio stream VAD (P2P AnalyserNode + relay speaking decay)
    for (const [peerId, entry] of this.peers.entries()) {
      if (entry.pc?.connectionState === 'connected' && entry.analyser && entry.analyserData) {
        entry.analyser.getByteTimeDomainData(entry.analyserData);
        const rms = computeRmsLevel(entry.analyserData);
        const next = evaluateSpeakingState({
          prevSpeaking: entry.speaking,
          rms,
          nowMs: now,
          lastAboveStopMs: entry.lastAboveStopMs,
        });
        entry.lastAboveStopMs = next.lastAboveStopMs;
        if (next.speaking !== entry.speaking) {
          entry.speaking = next.speaking;
          this.callbacks.onPeerSpeakingLocalDetect?.(peerId, entry.speaking);
        }
      } else if (entry.speaking && now - entry.lastRelayReceivedMs > RELAY_SPEAK_DECAY_MS) {
        entry.speaking = false;
        this.callbacks.onPeerSpeakingLocalDetect?.(peerId, false);
      }
    }
  }
}
