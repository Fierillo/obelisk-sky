// The person / place card's own controls: the × closes it, and on a phone
// (where it's a sheet) its head is a grip you drag to put it away. The drag
// only starts off the buttons: capturing the pointer on the head would steal
// the × button's click, and the card would never close.

export function wireCard(card: HTMLElement, close: () => void): void {
  const head = card.querySelector('.card-head') as HTMLElement;
  (card.querySelector('.card-close') as HTMLElement).addEventListener('click', close);
  let from: number | null = null;
  head.addEventListener('pointerdown', (e) => {
    if ((e.target as Element | null)?.closest('button, a, input, select')) return;
    from = e.clientY;
    head.setPointerCapture?.(e.pointerId);
  });
  head.addEventListener('pointermove', (e) => {
    if (from === null) return;
    card.style.transform = `translateY(${Math.max(0, e.clientY - from)}px)`;
  });
  const end = (e: PointerEvent) => {
    if (from === null) return;
    const dy = e.clientY - from;
    from = null;
    card.style.transform = '';
    if (dy > 70) close();
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
}
