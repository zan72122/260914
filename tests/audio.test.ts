import { describe, expect, it } from 'vitest';
import { GameAudio, type AmbienceInput } from '../src/audio/GameAudio';
import { SPEECH_PITCH, SPEECH_RATE, Speech, pickJapaneseVoice, type SynthLike } from '../src/audio/Speech';
import { JOB_RUN_MS, type SpeechRequest } from '../src/game/world';
import type { LogEntry } from '../src/core/EventLog';

function quiet(overrides: Partial<AmbienceInput> = {}): AmbienceInput {
  return { flameElement: null, flameIntensityPct: 100, sparking: false, ...overrides };
}

function makeAudio(): GameAudio {
  const a = new GameAudio();
  a.captureOnly = true;
  return a;
}

function keys(a: GameAudio): string[] {
  return a.captured().map((r) => `${r.cue}:${r.action}`);
}

describe('環境音（Web Audio で合成、音声ファイルは持たない）', () => {
  it('工房の持続音（バーナーと波）が一度だけ始まる', () => {
    const a = makeAudio();
    a.update(quiet(), 16);
    a.update(quiet(), 32);
    a.update(quiet(), 48);
    expect(keys(a)).toEqual(['burner:start', 'waves:start']);
  });

  it('材料が炎に入ると「ジュッ」が鳴り、炎の音の色が元素で変わる', () => {
    const a = makeAudio();
    a.update(quiet(), 16);
    a.onEvent({ t: 100, kind: 'flame', msg: 'enter', data: { material: 'copper_scrap', element: 'copper' } });
    a.update(quiet({ flameElement: 'copper' }), 116);
    a.update(quiet({ flameElement: 'copper' }), 132);
    a.onEvent({ t: 200, kind: 'flame', msg: 'exit', data: { material: 'copper_scrap', element: 'copper' } });
    a.update(quiet(), 216);

    expect(keys(a)).toEqual([
      'burner:start',
      'waves:start',
      'material_enter:play',
      'burner:change',
      'burner:change',
    ]);
    const enter = a.captured().find((r) => r.cue === 'material_enter');
    expect(enter?.t).toBe(100);
    expect(enter?.data?.element).toBe('copper');
    const changes = a.captured().filter((r) => r.cue === 'burner' && r.action === 'change');
    expect(changes.map((c) => c.data?.element)).toEqual(['copper', null]);
  });

  it('切れた線が呼ばれている間だけ火花が鳴る', () => {
    const a = makeAudio();
    a.update(quiet(), 16);
    a.update(quiet({ sparking: true }), 32);
    a.update(quiet({ sparking: true }), 48);
    a.update(quiet({ sparking: false }), 64);
    expect(keys(a).filter((k) => k.startsWith('sparks'))).toEqual(['sparks:start', 'sparks:stop']);
  });

  it('仕事が動いた瞬間、三つとも別の物理音が鳴る', () => {
    const cases: [string, string][] = [
      ['wiring', 'current'],
      ['flare', 'flare_launch'],
      ['battery', 'battery_machine'],
    ];
    for (const [job, cue] of cases) {
      const a = makeAudio();
      a.update(quiet(), 16);
      a.onEvent({ t: 500, kind: 'deliver', msg: 'success', data: { job, material: 'x', element: 'copper' } });
      const rec = a.captured().filter((r) => r.action === 'play');
      expect(rec.map((r) => r.cue)).toEqual([cue]);
      expect(rec[0].t).toBe(500);
      expect(rec[0].data?.runMs).toBe(JOB_RUN_MS[job as 'wiring']);
    }
    // 三つの音は互いに違う
    expect(new Set(cases.map(([, cue]) => cue)).size).toBe(3);
  });

  it('届かなかった（不一致）ときは物理音を鳴らさない', () => {
    const a = makeAudio();
    a.update(quiet(), 16);
    a.onEvent({
      t: 500,
      kind: 'deliver',
      msg: 'mismatch',
      data: { job: 'wiring', material: 'lithium_powder', reason: 'element_mismatch' },
    });
    a.onEvent({ t: 520, kind: 'deliver', msg: 'dropped', data: { material: 'lithium_powder', at: 'bench' } });
    expect(a.captured().filter((r) => r.action === 'play')).toEqual([]);
  });

  it('シナリオを読み直すと音の記録も持ち越さない', () => {
    const a = makeAudio();
    a.update(quiet(), 16);
    a.onEvent({ t: 100, kind: 'flame', msg: 'enter', data: { element: 'lithium' } });
    expect(a.captured().length).toBeGreaterThan(0);
    a.clear();
    expect(a.captured()).toEqual([]);
    a.update(quiet(), 16);
    expect(keys(a)).toEqual(['burner:start', 'waves:start']);
  });

  it('記録は固定長で、古いものから落ちる', () => {
    const a = new GameAudio(4);
    a.captureOnly = true;
    a.update(quiet(), 16);
    for (let i = 0; i < 6; i++) {
      a.onEvent({ t: 100 + i, kind: 'flame', msg: 'enter', data: { element: 'copper' } });
    }
    expect(a.captured().length).toBe(4);
    expect(a.captured().every((r) => r.cue === 'material_enter')).toBe(true);
  });

  it('時刻はすべて GameClock 由来で、壁時計を使わない', () => {
    const a = makeAudio();
    a.update(quiet(), 1234);
    expect(a.captured().every((r) => r.t === 1234)).toBe(true);
  });
});

// ---- 合成音声 ----

interface FakeUtterance {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  voice: SpeechSynthesisVoice | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

function voice(name: string, lang: string, isDefault = false): SpeechSynthesisVoice {
  return { name, lang, default: isDefault, localService: true, voiceURI: name } as SpeechSynthesisVoice;
}

class FakeSynth implements SynthLike {
  spoken: FakeUtterance[] = [];
  cancels = 0;
  speaking = false;
  pending = false;
  constructor(private voices: SpeechSynthesisVoice[] = []) {}
  speak(u: SpeechSynthesisUtterance): void {
    this.spoken.push(u as unknown as FakeUtterance);
  }
  cancel(): void {
    this.cancels++;
  }
  getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }
  setVoices(v: SpeechSynthesisVoice[]): void {
    this.voices = v;
  }
  /** 一番最後に出した発話を終わらせる */
  finish(i: number): void {
    this.spoken[i].onend?.();
  }
}

function makeSpeech(synth: FakeSynth | null): Speech {
  const s = new Speech(100, {
    synth: () => synth,
    makeUtterance: (text) =>
      ({
        text,
        lang: '',
        rate: 1,
        pitch: 1,
        volume: 1,
        voice: null,
        onend: null,
        onerror: null,
      }) as unknown as SpeechSynthesisUtterance,
  });
  return s;
}

const call = (label: string): SpeechRequest => ({ text: label, label, reason: 'call' });
const thanks = (label: string): SpeechRequest => ({ text: label, label, reason: 'thanks' });

describe('名前の声', () => {
  it('ja-JP の声を選ぶ。無ければ端末の既定に任せる', () => {
    const ja = voice('Kyoko', 'ja-JP');
    const jaDefault = voice('Otoya', 'ja-JP', true);
    expect(pickJapaneseVoice([voice('Samantha', 'en-US'), ja, jaDefault])).toBe(jaDefault);
    expect(pickJapaneseVoice([voice('Samantha', 'en-US'), ja])).toBe(ja);
    // 地域違いの日本語しか無ければそれを使う
    expect(pickJapaneseVoice([voice('X', 'ja')])?.name).toBe('X');
    expect(pickJapaneseVoice([voice('Samantha', 'en-US')])).toBeNull();
  });

  it('選んだ声・子ども向けの速さと高さで喋る', () => {
    const synth = new FakeSynth([voice('Samantha', 'en-US'), voice('Kyoko', 'ja-JP')]);
    const s = makeSpeech(synth);
    s.unlock();
    s.speak(call('どう〜'), 100);
    const u = synth.spoken[synth.spoken.length - 1];
    expect(u.text).toBe('どう〜');
    expect(u.lang).toBe('ja-JP');
    expect(u.rate).toBe(SPEECH_RATE);
    expect(u.pitch).toBe(SPEECH_PITCH);
    expect(u.voice?.name).toBe('Kyoko');
    expect(SPEECH_RATE).toBeLessThan(1);
  });

  it('声の一覧が遅れて届いても、その後の発話で ja-JP に切り替わる', () => {
    const synth = new FakeSynth([]);
    const s = makeSpeech(synth);
    s.unlock();
    s.speak(call('どう〜'), 100);
    expect(synth.spoken[synth.spoken.length - 1].voice).toBeNull();
    synth.setVoices([voice('Kyoko', 'ja-JP')]);
    synth.finish(synth.spoken.length - 1);
    s.speak(call('リチウム〜'), 200);
    expect(synth.spoken[synth.spoken.length - 1].voice?.name).toBe('Kyoko');
  });

  it('呼び声は待ち行列。前の呼び声が終わってから次が鳴る', () => {
    const synth = new FakeSynth([voice('Kyoko', 'ja-JP')]);
    const s = makeSpeech(synth);
    s.unlock();
    const before = synth.spoken.length; // 解錠の無音発話
    s.speak(call('どう〜'), 100);
    s.speak(call('ストロンチウム〜'), 120);
    s.speak(call('リチウム〜'), 140);
    expect(synth.spoken.slice(before).map((u) => u.text)).toEqual(['どう〜']);
    expect(s.queuedCalls).toBe(2);

    synth.finish(before);
    expect(synth.spoken.slice(before).map((u) => u.text)).toEqual(['どう〜', 'ストロンチウム〜']);
    synth.finish(before + 1);
    expect(synth.spoken.slice(before).map((u) => u.text)).toEqual([
      'どう〜',
      'ストロンチウム〜',
      'リチウム〜',
    ]);
    expect(s.queuedCalls).toBe(0);
  });

  it('礼は即時で、鳴っている呼び声を打ち切らない', () => {
    const synth = new FakeSynth([voice('Kyoko', 'ja-JP')]);
    const s = makeSpeech(synth);
    s.unlock();
    const before = synth.spoken.length;
    s.speak(call('どう〜'), 100);
    s.speak(call('リチウム〜'), 110);
    s.speak(thanks('どう、ありがとう'), 200);

    // 礼は待ち行列を通さずすぐ出る。呼び声は打ち切られない
    expect(synth.spoken.slice(before).map((u) => u.text)).toEqual(['どう〜', 'どう、ありがとう']);
    expect(synth.cancels).toBe(0);
    expect(s.queuedCalls).toBe(1);

    // 礼のあとも、呼び声の待ち行列は元の順で続く
    synth.finish(before);
    expect(synth.spoken.slice(before).map((u) => u.text)).toEqual([
      'どう〜',
      'どう、ありがとう',
      'リチウム〜',
    ]);
  });

  it('解錠前は鳴らさないが、記録は残る（iOS は最初のタッチまで鳴らせない）', () => {
    const synth = new FakeSynth([voice('Kyoko', 'ja-JP')]);
    const s = makeSpeech(synth);
    s.speak(call('どう〜'), 100);
    expect(synth.spoken).toEqual([]);
    expect(s.captured().map((r) => r.label)).toEqual(['どう〜']);
  });

  it('合成音声が無い端末では無音のまま成立し、記録だけが残る', () => {
    const s = makeSpeech(null);
    expect(s.available).toBe(false);
    s.unlock();
    s.speak(call('どう〜'), 100);
    s.speak(thanks('どう、ありがとう'), 200);
    expect(s.captured().map((r) => r.label)).toEqual(['どう〜', 'どう、ありがとう']);
  });

  it('検証では実発話せず、発話予定テキストだけを記録する', () => {
    const synth = new FakeSynth([voice('Kyoko', 'ja-JP')]);
    const s = makeSpeech(synth);
    s.captureOnly = true;
    s.unlock();
    s.speak(call('どう〜'), 100);
    s.speak(thanks('どう、ありがとう'), 200);
    expect(synth.spoken).toEqual([]);
    expect(s.captured().map((r) => r.text)).toEqual(['どう〜', 'どう、ありがとう']);
  });

  it('読み直すと待ち行列も記録も持ち越さない', () => {
    const synth = new FakeSynth([voice('Kyoko', 'ja-JP')]);
    const s = makeSpeech(synth);
    s.unlock();
    s.speak(call('どう〜'), 100);
    s.speak(call('リチウム〜'), 110);
    s.clear();
    expect(s.queuedCalls).toBe(0);
    expect(s.captured()).toEqual([]);
  });
});

describe('出来事ログと音のつながり', () => {
  it('EventLog の kind にだけ反応し、知らない出来事では鳴らない', () => {
    const a = makeAudio();
    a.update(quiet(), 16);
    const ignored: LogEntry[] = [
      { t: 10, kind: 'scenario', msg: 'loaded' },
      { t: 20, kind: 'input', msg: 'down' },
      { t: 30, kind: 'input', msg: 'up' },
      { t: 40, kind: 'job', msg: 'trouble', data: { job: 'flare' } },
      { t: 50, kind: 'job', msg: 'done', data: { job: 'flare' } },
    ];
    for (const e of ignored) a.onEvent(e);
    expect(keys(a)).toEqual(['burner:start', 'waves:start']);
  });
});
