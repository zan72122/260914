import { EventLog, type LogEntry } from './EventLog';

/**
 * 出来事ログに、横で聞いている人（音）をつなげるだけの薄い層。
 * 記録の意味も容量も EventLog のまま変えない。
 */
export class EventTap extends EventLog {
  private listeners: ((e: LogEntry) => void)[] = [];

  onEvent(fn: (e: LogEntry) => void): void {
    this.listeners.push(fn);
  }

  override push(entry: LogEntry): void {
    super.push(entry);
    for (const fn of this.listeners) fn(entry);
  }
}
