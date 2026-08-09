/**
 * Web Audio 기반 절차 생성 BGM + 효과음.
 * 외부 오디오 에셋 없이 오실레이터/노이즈만으로 칩튠 루프를 연주한다.
 */

const MUTE_KEY = 'make-ten:muted';

const BPM = 112;
const STEP_SEC = 60 / BPM / 4; // 16분음표
const LOOP_STEPS = 64; // 4마디 × 16스텝

const freq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

// A단조 진행 (Am → F → C → G), 0 = 쉼표
// prettier-ignore
const MELODY: number[] = [
  69, 0, 72, 0, 74, 0, 76, 0, 74, 0, 72, 0, 69, 0, 64, 0, // Am
  65, 0, 69, 0, 72, 0, 76, 0, 72, 0, 69, 0, 65, 0, 60, 0, // F
  64, 0, 67, 0, 72, 0, 76, 0, 79, 0, 76, 0, 72, 0, 67, 0, // C
  62, 0, 67, 0, 71, 0, 74, 0, 71, 0, 67, 0, 62, 0, 59, 0, // G
];
const BASS_ROOTS = [45, 41, 48, 43]; // A2, F2, C3, G2
const PAD_CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [55, 60, 64], // C
  [50, 55, 59], // G
];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private musicStarted = false;
  private step = 0;
  private nextNoteTime = 0;
  muted: boolean;

  constructor() {
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
  }

  /** 사용자 제스처 안에서 최초 호출되어야 함 (autoplay 정책) */
  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);

      const len = Math.floor(this.ctx.sampleRate * 0.1);
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      if (this.muted) void this.ctx.suspend();
    }
    return this.ctx;
  }

  startMusic(): void {
    const ctx = this.ensureContext();
    if (this.musicStarted) return;
    this.musicStarted = true;
    this.nextNoteTime = ctx.currentTime + 0.05;
    this.scheduler();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    if (this.ctx) {
      if (this.muted) void this.ctx.suspend();
      else void this.ctx.resume();
    }
    return this.muted;
  }

  // ---------- BGM 시퀀서 ----------

  private scheduler = (): void => {
    const ctx = this.ctx!;
    while (this.nextNoteTime < ctx.currentTime + 0.15) {
      this.playStep(this.step % LOOP_STEPS, this.nextNoteTime);
      this.nextNoteTime += STEP_SEC;
      this.step++;
    }
    window.setTimeout(this.scheduler, 40);
  };

  private playStep(i: number, t: number): void {
    const bar = Math.floor(i / 16);

    const m = MELODY[i];
    if (m > 0) this.note(freq(m), t, 0.22, 'square', 0.038);

    if (i % 2 === 0) {
      const octave = i % 8 === 4 ? 12 : 0;
      this.note(freq(BASS_ROOTS[bar] + octave), t, 0.2, 'triangle', 0.07);
    }

    if (i % 16 === 0) {
      for (const n of PAD_CHORDS[bar]) {
        this.note(freq(n), t, STEP_SEC * 16, 'triangle', 0.016, 0.4);
      }
    }

    if (i % 4 === 2) this.hat(t);
  }

  private note(
    frequency: number,
    t: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    attack = 0.008,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private hat(t: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer!;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.02, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(hp).connect(env).connect(this.master!);
    src.start(t);
    src.stop(t + 0.05);
  }

  // ---------- 효과음 ----------

  /** 제거 성공: 목표 합마다 다른 음높이의 짧은 2음 */
  sfxClear(sum: number): void {
    if (!this.ctx) return;
    const base = { 10: 740, 13: 620, 15: 680, 17: 830, 20: 930 }[sum] ?? 740;
    const t = this.ctx.currentTime;
    this.note(base, t, 0.1, 'square', 0.06);
    this.note(base * 1.335, t + 0.07, 0.14, 'square', 0.06);
  }

  /** 보드 초기화: 하강 스윕 */
  sfxReset(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.25);
    env.gain.setValueAtTime(0.05, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(env).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  /** 게임 종료: 마무리 3음 */
  sfxEnd(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.note(523, t, 0.15, 'triangle', 0.07);
    this.note(659, t + 0.12, 0.15, 'triangle', 0.07);
    this.note(784, t + 0.24, 0.3, 'triangle', 0.07);
  }
}
