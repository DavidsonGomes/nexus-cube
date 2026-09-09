/** Hash routing shared by the R1 shell and the isolated AppV4: write the area
 * on navigation (pushing a history entry so browser back/forward traverse
 * areas), listen to hashchange, and fall back to the default area on any
 * unknown hash. Reverting is a replaceState so a busy block never piles
 * history entries. */
export interface HashRouteOptions<A extends string> {
  areas: readonly A[];
  fallback: A;
}

export function areaFromHash<A extends string>(hash: string, options: HashRouteOptions<A>): A {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  return (options.areas as readonly string[]).includes(value) ? value as A : options.fallback;
}

export function writeAreaHash(area: string): void {
  if (location.hash.slice(1) === area) return;
  location.hash = area;
}

export function revertAreaHash(area: string): void {
  history.replaceState(null, '', `#${area}`);
}

export function listenAreaHash<A extends string>(options: HashRouteOptions<A>, handler: (area: A) => void): () => void {
  const change = () => handler(areaFromHash(location.hash, options));
  window.addEventListener('hashchange', change);
  return () => window.removeEventListener('hashchange', change);
}
