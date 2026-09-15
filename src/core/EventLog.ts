/** 固定長リングバッファの出来事ログ。毎フレームの位置は残さない。 */
export interface LogEntry {
  /** ゲーム内時刻（ms） */
  t: number;
  /** 種別（input / state / flame / deliver / speech など） */
  kind: string;
  /** 短い説明 */
  msg: string;
  /** 付随する小さな値 */
  data?: Record<string, unknown>;
}

export class EventLog {
  private buf: LogEntry[] = [];

  constructor(private readonly capacity = 200) {}

  push(entry: LogEntry): void {
    this.buf.push(entry);
    if (this.buf.length > this.capacity) this.buf.shift();
  }

  clear(): void {
    this.buf = [];
  }

  tail(n?: number): LogEntry[] {
    if (n === undefined || n >= this.buf.length) return this.buf.slice();
    return this.buf.slice(this.buf.length - n);
  }
}
