const CHECK_EVERY_MS = 5 * 60 * 1000;

/**
 * Browsers (especially Safari) can keep serving a cached copy of the page
 * after a new version is deployed. Poll version.json, which is never cached,
 * and offer a reload that's guaranteed to fetch the fresh page.
 */
export function watchForUpdates(container: HTMLElement) {
  if (import.meta.env.DEV) return;
  let shown = false;

  const check = async () => {
    if (shown) return;
    try {
      const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const { build } = (await res.json()) as { build?: string };
      if (build && build !== __BUILD_ID__) show(build);
    } catch {
      // Offline or blocked; try again later.
    }
  };

  const show = (build: string) => {
    shown = true;
    const banner = document.createElement('div');
    banner.className = 'update-banner';
    banner.innerHTML = `<span>A new version is available. Reloading starts a fresh circuit.</span><button class="btn btn-sm btn-primary">Reload</button>`;
    // A new query string makes the browser fetch the page itself fresh, not from cache.
    banner.querySelector('button')!.addEventListener('click', () => location.assign(`${location.pathname}?v=${build}`));
    container.appendChild(banner);
  };

  setTimeout(check, 3000);
  setInterval(check, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}
