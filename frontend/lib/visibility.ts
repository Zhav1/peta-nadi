/**
 * Phase 163b (M8) — poll gating.
 *
 * A backgrounded dashboard tab must not keep hammering a 0.1-CPU backend, so
 * every poller checks visibility before firing and resumes when the tab comes
 * back. Kept as two tiny helpers instead of a hook so it can also be used from
 * non-React call sites and inside effects that already own their own lifecycle.
 */

/** True on the server too: render-time callers must never assume "hidden". */
export function isDocumentVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState !== 'hidden';
}

/**
 * Subscribe to visibility changes. Returns an unsubscribe function.
 * The callback fires only on real transitions (hidden → visible / visible → hidden).
 */
export function subscribeVisibility(
  callback: (visible: boolean) => void
): () => void {
  if (typeof document === 'undefined') return () => {};
  const handler = () => callback(document.visibilityState !== 'hidden');
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
