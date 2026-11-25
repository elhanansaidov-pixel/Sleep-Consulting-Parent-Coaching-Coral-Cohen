/** Demo mode (`/admin?demo=1`): sample data in this browser only, no database connection. */
export const isDemo = (): boolean =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1';

/** Browser-storage key; demo mode keeps its own separate memory (data + assistant). */
export const storeKey = (k: string) => (isDemo() ? `cc-demo:${k}` : k);

export function resetDemo() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('cc-demo:')) localStorage.removeItem(k);
  } catch { /* ignore */ }
  window.location.reload();
}

export function exitDemo() {
  window.location.href = '/admin';
}
