// The village's first state: the loading screen holds until it is in (the
// relay's snapshot, or any other feed's, through main.ts `handle`), so the
// houses and villagers are built and their shaders warmed before "loaded".
// With no feed running nothing is coming, and the wait is capped either way.

export type FirstStateEnd = 'arrived' | 'none' | 'timeout';

export class FirstState {
  private seen = false;
  private wake: (() => void) | null = null;

  /** A snapshot reached the village (or is queued for it). */
  arrived(): void {
    this.seen = true;
    this.wake?.();
  }

  get has(): boolean {
    return this.seen;
  }

  /**
   * Resolves once a snapshot arrived; at once while none is coming
   * (`expecting()` false: logged out, refused, no feed); or after `capMs`.
   * `expecting` is asked again every `stepMs` (a feed starting late, a
   * snapshot queued without passing `arrived`).
   */
  wait(expecting: () => boolean, capMs = 6000, stepMs = 100): Promise<FirstStateEnd> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let done = false;
      const started = Date.now();
      const finish = (why: FirstStateEnd): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.wake = null;
        resolve(why);
      };
      const check = (): void => {
        if (this.seen) return finish('arrived');
        const coming = expecting();
        if (done) return;
        if (!coming) return finish(this.seen ? 'arrived' : 'none');
        if (Date.now() - started >= capMs) return finish('timeout');
        timer = setTimeout(check, stepMs);
      };
      this.wake = () => finish('arrived');
      check();
    });
  }
}
