export function createRouter({ routes, fallback, onChange }) {
  function currentPath() {
    const hash = window.location.hash.replace(/^#/, '');
    return hash || '/';
  }

  function match(path) {
    if (routes[path]) return routes[path];
    for (const key of Object.keys(routes)) {
      if (key.endsWith('/*') && path.startsWith(key.slice(0, -1))) return routes[key];
    }
    return fallback;
  }

  function resolve() {
    const path = currentPath();
    onChange(match(path), path);
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
