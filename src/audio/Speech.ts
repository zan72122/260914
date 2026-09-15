import type { SpeechRequest } from '../game/world';

export interface SpeechRecord {
  /** ゲーム内時刻（ms） */
  t: number;
  text: string;
  label: string;
  reason: string;
}

/**
 * 名前の声。iOS 内蔵合成音声のみ（Web Speech API, ja-JP、読みはかな）。
 * 合成音声が無い端末では無音で成立する（名前は追加の情報であり、成立条件にしない）。
 */
export class Speech {
  private records: SpeechRecord[] = [];
  private unlocked = false;
  /** 検証では実発話せず、発話予定テキストのみ記録する */
  captureOnly = false;

  constructor(private readonly capacity = 100) {}

  private get synth(): SpeechSynthesis | null {
    if (typeof window === 'undefined') return null;
    return window.speechSynthesis ?? null;
  }

  get available(): boolean {
    return this.synth !== null && typeof SpeechSynthesisUtterance === 'function';
  }

  /** iOS は利用者の操作の中でしか鳴らせないため、最初のタッチで無音の発話を一度行う。 */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.captureOnly || !this.available) return;
    try {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      u.lang = 'ja-JP';
      this.synth!.speak(u);
    } catch {
      /* 合成音声が無ければ無音で続ける */
    }
  }

  speak(req: SpeechRequest, timeMs: number): void {
    this.records.push({ t: timeMs, text: req.text, label: req.label, reason: req.reason });
    if (this.records.length > this.capacity) this.records.shift();
    if (this.captureOnly || !this.available || !this.unlocked) return;
    try {
      const u = new SpeechSynthesisUtterance(req.text);
      u.lang = 'ja-JP';
      u.rate = 0.95;
      const voice = this.synth!.getVoices().find((v) => v.lang.toLowerCase().startsWith('ja'));
      if (voice) u.voice = voice;
      this.synth!.speak(u);
    } catch {
      /* 無音で続ける */
    }
  }

  captured(): SpeechRecord[] {
    return this.records.slice();
  }

  clear(): void {
    this.records = [];
    this.unlocked = false;
  }
}
