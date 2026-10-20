// Module hooks (registered by analyze.mjs) that let Node import https: URLs -
// the app loads chess.js straight from cdnjs (js/chessLib.js), which Node
// can't do on its own. Keeps the app's analysis code usable unchanged.

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('https://')) return { url: specifier, shortCircuit: true };
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith('https://')) return nextLoad(url, context);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} konnte nicht geladen werden (${res.status})`);
  return { format: 'module', source: await res.text(), shortCircuit: true };
}
