/**
 * Rich procedural Web Audio arcade synthesizer for DecaLudo tabletop sound effects.
 * Uses a master GainNode so volume scales smoothly from 0% to 100%, plus filtered
 * noise bursts for woody clicks, card snaps, impact punches, and sparkling chimes.
 */
class SoundController {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private volume = 0.8;

  private syncMasterGain() {
    if (!this.ctx || !this.masterGain) return;
    const effective = this.muted ? 0 : this.volume;
    this.masterGain.gain.setTargetAtTime(effective, this.ctx.currentTime, 0.015);
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    this.syncMasterGain();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setVolume(nextVolume: number) {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(nextVolume) ? nextVolume : 0.8));
    this.volume = clamped;
    this.syncMasterGain();
  }

  public getVolume(): number {
    return this.volume;
  }

  private getOutput(): { ctx: AudioContext; out: GainNode } | null {
    if (this.muted || this.volume <= 0 || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.masterGain) return null;
    return { ctx: this.ctx, out: this.masterGain };
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const len = Math.floor(ctx.sampleRate * 0.4);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private playNoiseBurst(
    ctx: AudioContext,
    out: GainNode,
    startTime: number,
    duration: number,
    filterFreq: number,
    filterType: BiquadFilterType,
    peakGain: number
  ) {
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, startTime);
    filter.Q.setValueAtTime(1.4, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.001, peakGain), startTime);
    gain.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start(startTime);
    src.stop(startTime + duration + 0.01);
  }

  private playTone(
    ctx: AudioContext,
    out: GainNode,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    startTime: number,
    duration: number,
    peakGain: number
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, startFreq), startTime);
    if (endFreq !== startFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), startTime + duration);
    }
    gain.gain.setValueAtTime(0.0008, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.014, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);
    osc.connect(gain);
    gain.connect(out);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.015);
  }

  public playButtonClick() {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    this.playTone(ctx, out, 'triangle', 580, 780, now, 0.045, 0.08);
    this.playNoiseBurst(ctx, out, now, 0.02, 2600, 'bandpass', 0.04);
  }

  public playVolumePreview() {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    this.playTone(ctx, out, 'triangle', 523.25, 659.25, now, 0.11, 0.13);
    this.playTone(ctx, out, 'sine', 783.99, 1046.5, now + 0.06, 0.12, 0.09);
  }

  public playDiceRattle() {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    const clicks = [0, 0.052, 0.11, 0.175, 0.245, 0.32];
    clicks.forEach((offset, i) => {
      const pitch = 230 + i * 36 + Math.random() * 55;
      this.playTone(ctx, out, 'triangle', pitch, 105, now + offset, 0.04, 0.11);
      this.playNoiseBurst(ctx, out, now + offset, 0.025, 1900 + i * 180, 'bandpass', 0.09);
    });
  }

  public playDiceLand(value: number) {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    // Crisp wooden table thud
    this.playTone(ctx, out, 'sine', 190, 78, now, 0.08, 0.16);
    this.playNoiseBurst(ctx, out, now, 0.032, 1400, 'lowpass', 0.09);
    // Bright harmonic pop scaled by rolled number
    const freq = 320 + value * 46;
    this.playTone(ctx, out, 'triangle', freq, freq * 1.18, now + 0.02, 0.09, 0.1);
  }

  public playLuckySix() {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      this.playTone(ctx, out, 'triangle', freq, freq * 1.02, now + i * 0.055, 0.22, 0.12);
      this.playTone(ctx, out, 'sine', freq * 2, freq * 2, now + i * 0.055, 0.14, 0.045);
    });
  }

  public playMercySix() {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    // Magical ascending clover arpeggio
    const notes = [440, 554.37, 659.25, 880, 1108.73];
    notes.forEach((freq, i) => {
      this.playTone(ctx, out, 'sine', freq, freq * 1.01, now + i * 0.055, 0.28, 0.13);
      this.playTone(ctx, out, 'triangle', freq * 1.5, freq * 1.5, now + i * 0.055 + 0.01, 0.16, 0.04);
    });
  }

  public playOnFireIgnite() {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    // Fiery whoosh + heroic power chord
    this.playNoiseBurst(ctx, out, now, 0.26, 900, 'bandpass', 0.18);
    this.playTone(ctx, out, 'sawtooth', 220, 440, now, 0.18, 0.08);
    [440, 554.37, 659.25, 880].forEach((freq, i) => {
      this.playTone(ctx, out, 'triangle', freq, freq * 1.03, now + 0.06 + i * 0.045, 0.26, 0.12);
    });
  }

  public playStepHop(stepIndex: number, isBackward: boolean) {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    const baseFreq = isBackward
      ? Math.max(190, 460 - stepIndex * 24)
      : Math.min(760, 330 + stepIndex * 34);
    // Bouncy wooden marimba pop
    this.playTone(ctx, out, 'sine', baseFreq * 0.85, baseFreq * 1.25, now, 0.045, 0.14);
    this.playTone(ctx, out, 'triangle', baseFreq * 1.25, baseFreq * 0.72, now + 0.032, 0.055, 0.09);
    this.playNoiseBurst(ctx, out, now + 0.035, 0.018, 2200, 'bandpass', 0.045);
  }

  public playDeploy() {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    // Party popper burst + upbeat triad!
    this.playNoiseBurst(ctx, out, now, 0.06, 3200, 'highpass', 0.14);
    [392.0, 523.25, 659.25, 783.99].forEach((freq, i) => {
      this.playTone(ctx, out, 'triangle', freq, freq * 1.02, now + i * 0.048, 0.18, 0.13);
    });
  }

  public playSafeLanding(isStack: boolean) {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    // Sparkling crystalline shield chime
    const chord = isStack ? [587.33, 739.99, 880, 1174.66] : [659.25, 880, 1318.51];
    chord.forEach((freq, i) => {
      this.playTone(ctx, out, 'sine', freq, freq, now + i * 0.045, 0.28, 0.11);
    });
  }

  public playHomeStretch() {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    // Rocket rising sweep
    this.playTone(ctx, out, 'sawtooth', 260, 780, now, 0.22, 0.075);
    this.playTone(ctx, out, 'triangle', 523.25, 1046.5, now + 0.05, 0.22, 0.11);
    this.playNoiseBurst(ctx, out, now, 0.18, 1800, 'bandpass', 0.08);
  }

  public playDirectionFlip(isBackward: boolean) {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    this.playTone(ctx, out, 'triangle', isBackward ? 580 : 360, isBackward ? 310 : 620, now, 0.1, 0.12);
    this.playNoiseBurst(ctx, out, now, 0.06, isBackward ? 1100 : 2100, 'bandpass', 0.06);
  }

  public playCapture() {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    // Heavy arcade kick impact + crunch burst + celebratory brass sting + comic slide down!
    this.playTone(ctx, out, 'sine', 195, 44, now, 0.2, 0.28);
    this.playNoiseBurst(ctx, out, now, 0.09, 1350, 'bandpass', 0.22);
    this.playTone(ctx, out, 'sawtooth', 620, 210, now + 0.04, 0.18, 0.085);
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      this.playTone(ctx, out, 'triangle', freq, freq * 1.01, now + 0.06 + idx * 0.065, 0.24, 0.13);
    });
  }

  public playCrawlStep(stepIndex: number) {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    // Tiny comic weeping waddle squeak
    const pitch = stepIndex % 2 === 0 ? 310 : 275;
    this.playTone(ctx, out, 'sine', pitch, pitch * 0.78, now, 0.06, 0.055);
  }

  public playForfeit() {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    // Sad trombone descending notes
    [392.0, 369.99, 349.23, 311.13].forEach((freq, idx) => {
      this.playTone(ctx, out, 'sawtooth', freq, freq * 0.94, now + idx * 0.11, 0.16, 0.085);
    });
  }

  public playSkipTurn() {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    this.playTone(ctx, out, 'sine', 340, 220, now, 0.13, 0.09);
  }

  public playTokenHome() {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      this.playTone(ctx, out, 'triangle', freq, freq, now + idx * 0.075, 0.28, 0.14);
      this.playTone(ctx, out, 'sine', freq * 2, freq * 2, now + idx * 0.075, 0.18, 0.045);
    });
  }

  public playCardSnap() {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    // Crisp papery card flick + snap
    this.playNoiseBurst(ctx, out, now, 0.045, 3100, 'highpass', 0.16);
    this.playTone(ctx, out, 'triangle', 680, 260, now, 0.055, 0.14);
  }

  public playUnoReverse() {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    this.playNoiseBurst(ctx, out, now, 0.18, 1600, 'bandpass', 0.11);
    [330, 440, 659.25, 880, 440].forEach((freq, idx) => {
      this.playTone(ctx, out, 'sawtooth', freq, freq * 1.12, now + idx * 0.042, 0.1, 0.08);
    });
  }

  public playUnoSkip() {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    [520, 310].forEach((freq, idx) => {
      this.playTone(ctx, out, 'square', freq, freq * 0.85, now + idx * 0.085, 0.12, 0.085);
    });
  }

  public playUnoKnockback() {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    // Heavy bowling slam + reverse laser drop!
    this.playTone(ctx, out, 'sine', 165, 42, now, 0.24, 0.28);
    this.playNoiseBurst(ctx, out, now, 0.13, 1000, 'lowpass', 0.22);
    this.playTone(ctx, out, 'sawtooth', 780, 140, now + 0.02, 0.26, 0.1);
  }

  public playChaosZap() {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    this.playNoiseBurst(ctx, out, now, 0.1, 2800, 'bandpass', 0.12);
    [420, 640, 960, 1320].forEach((freq, idx) => {
      this.playTone(ctx, out, 'triangle', freq, freq * 1.38, now + idx * 0.042, 0.13, 0.12);
    });
  }

  public playVictoryFanfare() {
    const audio = this.getOutput();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;
    const melody = [
      { f: 523.25, t: 0, d: 0.16 },
      { f: 659.25, t: 0.11, d: 0.16 },
      { f: 783.99, t: 0.22, d: 0.18 },
      { f: 1046.5, t: 0.34, d: 0.55 },
      { f: 783.99, t: 0.34, d: 0.55 },
      { f: 523.25, t: 0.34, d: 0.55 },
    ];
    melody.forEach((n) => {
      this.playTone(ctx, out, 'triangle', n.f, n.f, now + n.t, n.d, 0.13);
      this.playTone(ctx, out, 'sine', n.f * 2, n.f * 2, now + n.t, n.d * 0.75, 0.04);
    });
    this.playNoiseBurst(ctx, out, now + 0.34, 0.16, 4000, 'highpass', 0.08);
  }
}

export const soundFx = new SoundController();
