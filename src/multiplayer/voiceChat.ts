import type { OnlineSeat, VoiceSignalPayload } from './protocol';
import {
  computeRmsLevel,
  evaluateSpeakingState,
  getActiveVoicePeerIds,
  shouldInitiateWebRtcOffer,
} from './voiceLogic';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export interface VoiceUiSnapshot {
  joined: boolean;
  joining: boolean;
  muted: boolean;
  deafened: boolean;
  localSpeaking: boolean;
  error: string | null;
  activePeerCount: number;
}

interface VoiceManagerCallbacks {
  sendVoiceState: (joined: boolean, muted: boolean, speaking: boolean) => void;
  sendVoiceSignal: (targetClientId: string, signal: VoiceSignalPayload) => void;
  onSnapshot: (snapshot: VoiceUiSnapshot) => void;
  onPeerSpeakingLocalDetect?: (clientId: string, speaking: boolean) => void;
}

interface PeerEntry {
  pc: RTCPeerConnection;
  audioEl: HTMLAudioElement;
  pendingIce: RTCIceCandidateInit[];
  remoteDescriptionSet: boolean;
  analyser?: AnalyserNode;
  analyserData?: Uint8Array<ArrayBuffer>;
  sourceNode?: MediaStreamAudioSourceNode;
  speaking: boolean;
  lastAboveStopMs: number;
}

/**
 * Real peer-to-peer WebRTC room voice chat manager (zero database needed).
 * Reuses the room's WebSocket server strictly for signaling and presence,
 * and monitors microphone + remote audio via Web Audio AnalyserNode for live speaking indicators.
 */
export class RoomVoiceManager {
  private readonly localClientId: string;
  private readonly callbacks: VoiceManagerCallbacks;

  private localStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private localSource: MediaStreamAudioSourceNode | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localAnalyserData: Uint8Array<ArrayBuffer> | null = null;
  private vadTimer: number | null = null;

  private peers = new Map<string, PeerEntry>();
  private latestSeats: OnlineSeat[] = [];

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

  getSnapshot(): VoiceUiSnapshot {
    return {
      joined: this.joined,
      joining: this.joining,
      muted: this.muted,
      deafened: this.deafened,
      localSpeaking: this.localSpeaking,
      error: this.error,
      activePeerCount: this.peers.size,
    };
  }

  private emitSnapshot() {
    this.callbacks.onSnapshot(this.getSnapshot());
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
    this.emitSnapshot();

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

      this.setupLocalVad(stream);
      this.callbacks.sendVoiceState(true, false, false);
      this.syncPeers(this.latestSeats);
      this.emitSnapshot();
      return true;
    } catch (err) {
      this.joining = false;
      this.joined = false;
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

  leaveVoice(notifyServer = true) {
    const wasJoined = this.joined;
    this.joined = false;
    this.joining = false;
    this.muted = false;
    this.deafened = false;
    this.localSpeaking = false;
    this.error = null;

    if (this.vadTimer !== null) {
      window.clearInterval(this.vadTimer);
      this.vadTimer = null;
    }

    for (const peerId of Array.from(this.peers.keys())) {
      this.closePeer(peerId);
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
        if (entry && shouldInitiateWebRtcOffer(this.localClientId, peerId)) {
          void this.initiateOffer(peerId, entry);
        }
      }
    }

    this.emitSnapshot();
  }

  async handleSignal(fromClientId: string, signal: VoiceSignalPayload) {
    if (!this.joined || !this.localStream) return;
    if (fromClientId === this.localClientId) return;

    let entry = this.peers.get(fromClientId);
    if (!entry) {
      entry = this.createPeerConnection(fromClientId);
      if (!entry) return;
    }

    try {
      if (signal.kind === 'offer') {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        entry.remoteDescriptionSet = true;
        await this.flushPendingIce(entry);
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        if (answer.sdp) {
          this.callbacks.sendVoiceSignal(fromClientId, {
            kind: 'answer',
            sdp: { type: 'answer', sdp: answer.sdp },
          });
        }
      } else if (signal.kind === 'answer') {
        if (entry.pc.signalingState === 'have-local-offer') {
          await entry.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          entry.remoteDescriptionSet = true;
          await this.flushPendingIce(entry);
        }
      } else if (signal.kind === 'ice') {
        if (entry.remoteDescriptionSet) {
          await entry.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          entry.pendingIce.push(signal.candidate);
        }
      }
    } catch {
      // Ignore transient negotiation race errors cleanly
    }
  }

  private async flushPendingIce(entry: PeerEntry) {
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
    if (typeof RTCPeerConnection === 'undefined' || !this.localStream) return undefined;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.setAttribute('playsinline', 'true');
    audioEl.muted = this.deafened;

    const entry: PeerEntry = {
      pc,
      audioEl,
      pendingIce: [],
      remoteDescriptionSet: false,
      speaking: false,
      lastAboveStopMs: 0,
    };

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
        // Autoplay may resolve after next user tap
      });
      this.attachRemoteVad(entry, remoteStream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (this.peers.get(peerId) === entry) {
          this.closePeer(peerId);
          this.emitSnapshot();
        }
      }
    };

    this.peers.set(peerId, entry);
    return entry;
  }

  private async initiateOffer(peerId: string, entry: PeerEntry) {
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
      entry.pc.close();
    } catch {
      // ignore
    }
    entry.audioEl.pause();
    entry.audioEl.srcObject = null;
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

  private setupLocalVad(stream: MediaStream) {
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

    // 2. Remote peer audio stream VAD (backup + instant low-latency indicator)
    for (const [peerId, entry] of this.peers.entries()) {
      if (!entry.analyser || !entry.analyserData) continue;
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
    }
  }
}
