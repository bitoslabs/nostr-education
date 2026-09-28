export function createRouter({ routes, fallback, onChange }) {
  function currentPath() {
    const hash = window.location.hash.replace(/^#/, '');
    return hash || '/';
  }

  function resolve() {
    const path = currentPath();
    onChange(routes[path] ?? fallback, path);
  }

  function start() {
    window.addEventListener('hashchange', resolve);
    resolve();
    return stop;
  }

  function stop() {
    window.removeEventListener('hashchange', resolve);
  }

  return { start, stop };
}

export function navigate(path) {
  window.location.hash = path;
}
