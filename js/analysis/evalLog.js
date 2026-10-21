// A compact log of the raw engine answers analyzeGame() asked for - one entry
// per evaluated position, in call order: "<bestmove> <pv1> <pv2>", score as
// centipawns or "#<n>" for mate, "-" for a missing line; entries joined by
// ",". Stored with every engine record (js/meta/metaRecords.js's
// buildEngineRecord + `evals`), so a game analyzed once - in the browser or by
// the GitHub job (scripts/auto-analysis/) - can be shown again in full by
// replaying the log through analyzeGame(), without an engine. ~1.5 KB/game.

const encodeScore = (line) => (!line ? '-' : line.mate !== undefined ? `#${line.mate}` : String(line.cp ?? 0));

function decodeScore(token, multipv) {
  if (!token || token === '-') return null;
  return token.startsWith('#') ? { multipv, mate: Number(token.slice(1)) } : { multipv, cp: Number(token) };
}

/** Wraps an engine so every evaluate() answer is also logged. `toString()` gives the stored form. */
export function recordingEngine(engine) {
  const entries = [];
  return {
    async evaluate(fen, options) {
      const result = await engine.evaluate(fen, options);
      const pv1 = result.lines.find((l) => l.multipv === 1) ?? result.lines[0];
      const pv2 = result.lines.find((l) => l.multipv === 2);
      entries.push(`${result.bestMoveUci} ${encodeScore(pv1)} ${encodeScore(pv2)}`);
      return result;
    },
    toString: () => entries.join(','),
  };
}

/** An engine stand-in that answers analyzeGame() from a recordingEngine() log, in the same order. */
export function replayEngine(log) {
  const entries = log.split(',');
  let next = 0;
  return {
    async evaluate() {
      const entry = entries[next++];
      if (entry === undefined) throw new Error('Die gespeicherte Analyse passt nicht zu dieser Partie.');
      const [bestMoveUci, s1, s2] = entry.split(' ');
      return { bestMoveUci, lines: [decodeScore(s1, 1), decodeScore(s2, 2)].filter(Boolean) };
    },
  };
}
