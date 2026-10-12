// The chat panel's message bar as a React island: ChatPanel (plain DOM)
// mounts it once into its composer slot and re-renders it with new props
// when the channel, the reply or the handlers change.

import { createRoot } from 'react-dom/client';
import SkyComposer, { type SkyComposerProps } from './SkyComposer';
import '../../obelisk.generated.css';

export type { SkyComposerProps };

export interface MountedComposer {
  render(props: Omit<SkyComposerProps, 'inputRef'>): void;
  focus(): void;
  unmount(): void;
}

export function mountComposer(el: HTMLElement): MountedComposer {
  const root = createRoot(el);
  const inputRef: { current: HTMLTextAreaElement | null } = { current: null };
  let last: Omit<SkyComposerProps, 'inputRef'> | null = null;
  return {
    render(props) {
      last = props;
      // Keyed by channel: a new channel gets a fresh draft, like the app's.
      root.render(<SkyComposer key={props.groupId} {...props} inputRef={inputRef} />);
    },
    focus() {
      if (last) inputRef.current?.focus();
    },
    unmount() {
      root.unmount();
    },
  };
}
