export function createScope() {
  let disposers = [];

  function add(disposer) {
    disposers.push(disposer);
    return disposer;
  }

  function dispose() {
    const pending = disposers;
    disposers = [];
    pending.forEach((disposer) => disposer());
  }

  return { add, dispose };
}
