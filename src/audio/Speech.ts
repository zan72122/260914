import type { SpeechRequest } from '../game/world';

export interface SpeechRecord {
  /** ゲーム内時刻（ms） */
  t: number;
  text: string;
  label: string;
  reason: string;
}

/** 子ども向けに少しゆっくり、少し高く。 */
export const SPEECH_RATE = 0.85;
export const SPEECH_PITCH = 1.15;

/** 端末の合成音声。window.speechSynthesis をそのまま使うが、検査では差し替えられる。 */
export interface SynthLike {
  speak(u: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
  speaking: boolean;
  pending: boolean;
  addEventListener?(type: 'voiceschanged', fn: () => void): void;
}

export interface SpeechDeps {
  synth: () => SynthLike | null;
  makeUtterance: (text: string) => SpeechSynthesisUtterance;
}

function browserDeps(): SpeechDeps {
  return {
    synth: () => {
      if (typeof window === 'undefined') return null;
      return (window.speechSynthesis as unknown as SynthLike) ?? null;
    },
    makeUtterance: (text) => new SpeechSynthesisUtterance(text),
  };
}

/**
 * ja-JP の声をひとつ選ぶ。
 * 1. lang が ja-JP のもの（既定の声を優先）
 * 2. lang が ja で始まるもの
 * 3. どれも無ければ null（端末の既定の声に任せる）
 */
export function pickJapaneseVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const norm = (v: SpeechSynthesisVoice): string => (v.lang ?? '').toLowerCase().replace('_', '-');
  const exact = voices.filter((v) => norm(v) === 'ja-jp');
  const loose = voices.filter((v) => norm(v).startsWith('ja'));
  const pool = exact.length > 0 ? exact : loose;
  if (pool.length === 0) return null;
  return pool.find((v) => v.default) ?? pool[0];
}

/**
 * 名前の声。iOS 内蔵合成音声のみ（Web Speech API, ja-JP、読みはかな）。
 *
 * 重なったときの決まり:
 * - 呼び声（reason: 'call'）は待ち行列に並び、前の呼び声が終わってから鳴る。
 * - 礼（reason: 'thanks'）は待たずに今すぐ鳴らし、鳴っている呼び声を打ち切らない。
 *   礼は子どもの行為への返事なので遅れて困る。
 *
 * 合成音声が無い端末では無音で動作し、名前無しでも遊べる
 * （名前は追加の情報であり、成立条件にしない）。
 */
export class Speech {
  private records: SpeechRecord[] = [];
  private unlocked = false;
  private queue: SpeechRequest[] = [];
  private callSpeaking = false;
  private voice: SpeechSynthesisVoice | null = null;
  private voiceResolved = false;
  private deps: SpeechDeps;

  /** 検証では実発話せず、発話予定テキストのみ記録する */
  captureOnly = false;

  constructor(private readonly capacity = 100, deps?: Partial<SpeechDeps>) {
    const base = browserDeps();
    this.deps = { synth: deps?.synth ?? base.synth, makeUtterance: deps?.makeUtterance ?? base.makeUtterance };
  }

  private get synth(): SynthLike | null {
    return this.deps.synth();
  }

  get available(): boolean {
    return this.synth !== null;
  }

  /** いま選んでいる ja-JP の声（検査・報告用）。 */
  get selectedVoice(): SpeechSynthesisVoice | null {
    return this.voice;
  }

  /**
   * 声の一覧は端末によって遅れて届く。取れたら選び直し、
   * 取れないうちは端末の既定の声で喋る（無音にはしない）。
   */
  private resolveVoice(): void {
    const s = this.synth;
    if (!s) return;
    const voices = s.getVoices();
    if (voices.length === 0) {
      if (!this.voiceResolved && s.addEventListener) {
        this.voiceResolved = true;
        s.addEventListener('voiceschanged', () => {
          this.voice = pickJapaneseVoice(this.synth?.getVoices() ?? []);
        });
      }
      return;
    }
    this.voice = pickJapaneseVoice(voices);
  }

  /** iOS は利用者の操作の中でしか鳴らせないため、最初のタッチで無音の発話を一度行う。 */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.captureOnly || !this.available) return;
    try {
      const u = this.deps.makeUtterance('');
      u.volume = 0;
      u.lang = 'ja-JP';
      this.synth!.speak(u);
      this.resolveVoice();
    } catch {
      /* 合成音声が無ければ無音で続ける */
    }
  }

  speak(req: SpeechRequest, timeMs: number): void {
    this.records.push({ t: timeMs, text: req.text, label: req.label, reason: req.reason });
    if (this.records.length > this.capacity) this.records.shift();
    if (this.captureOnly || !this.available || !this.unlocked) return;
    if (req.reason === 'call') {
      this.queue.push(req);
      this.pumpQueue();
    } else {
      // 礼は待ち行列を通さず今すぐ。鳴っている呼び声は打ち切らない（cancel は呼ばない）
      this.utter(req);
    }
  }

  /** 呼び声は一度にひとつだけ。前が終わってから次を出す。 */
  private pumpQueue(): void {
    if (this.callSpeaking) return;
    const next = this.queue.shift();
    if (!next) return;
    this.callSpeaking = true;
    this.utter(next, () => {
      this.callSpeaking = false;
      this.pumpQueue();
    });
  }

  private utter(req: SpeechRequest, onEnd?: () => void): void {
    try {
      this.resolveVoice();
      const u = this.deps.makeUtterance(req.text);
      u.lang = 'ja-JP';
      u.rate = SPEECH_RATE;
      u.pitch = SPEECH_PITCH;
      if (this.voice) u.voice = this.voice;
      if (onEnd) {
        u.onend = () => onEnd();
        u.onerror = () => onEnd();
      }
      this.synth!.speak(u);
    } catch {
      // 喋れなくても待ち行列は進める（無音のまま成立する）
      onEnd?.();
    }
  }

  /** 待ち行列に残っている呼び声の数（検査用）。 */
  get queuedCalls(): number {
    return this.queue.length;
  }

  captured(): SpeechRecord[] {
    return this.records.slice();
  }

  clear(): void {
    this.records = [];
    this.unlocked = false;
    this.queue = [];
    this.callSpeaking = false;
  }
}
