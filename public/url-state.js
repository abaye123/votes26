// Keeps the view state (tab, election, selected city, filters) in the query
// string so a reload or a shared link opens the same view.

const DEFAULTS = { tab: 'official', k: '26' };

export function getState() {
  const params = new URLSearchParams(location.search);
  return { ...DEFAULTS, ...Object.fromEntries(params) };
}

export function setState(patch) {
  const params = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === '' || DEFAULTS[key] === value) params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}
