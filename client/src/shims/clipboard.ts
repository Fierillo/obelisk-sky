// @/services/common/clipboard without the app's toast store.
export async function writeClipboardText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await writeClipboardText(text);
    return true;
  } catch {
    return false;
  }
}
