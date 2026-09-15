/**
 * 画面の大きさ・向きが変わったことを知らせる。
 *
 * iOS では回転の直後にはまだ新しい寸法が取れず、少し遅れて確定する。
 * また Safari の下部のバーが出入りすると window は変わらず visualViewport だけが変わる。
 * そのため resize / orientationchange / visualViewport を全部聞き、
 * 回転のあとは数回ゆらして最後の寸法で落ち着かせる。
 */
export function watchViewport(onChange: () => void): () => void {
  const later: number[] = [];
  const settle = (): void => {
    onChange();
    for (const d of [80, 250, 600]) {
      later.push(window.setTimeout(onChange, d));
    }
  };
  const vv = window.visualViewport ?? null;
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', settle);
  vv?.addEventListener('resize', onChange);
  vv?.addEventListener('scroll', onChange);
  return () => {
    window.removeEventListener('resize', onChange);
    window.removeEventListener('orientationchange', settle);
    vv?.removeEventListener('resize', onChange);
    vv?.removeEventListener('scroll', onChange);
    for (const id of later) window.clearTimeout(id);
  };
}
