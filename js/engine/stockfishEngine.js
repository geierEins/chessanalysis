// Wraps Stockfish running in a Web Worker. Vendored locally (js/engine/vendor/)
// rather than loaded from a CDN: browsers refuse to construct a classic Worker
// from a cross-origin script URL.
export const ENGINES = {
  sf19: { label: 'Stockfish 19 (aktuell, Lite NNUE)', path: './vendor/sf19/stockfish-19-lite-single.js' },
  sf19full: { label: 'Stockfish 19 Full (~99 MB Download)', path: './vendor/sf19full/stockfish-19-single.js' },
  sf16: { label: 'Stockfish 16 (NNUE)', path: './vendor/sf16/stockfish-nnue-16-single.js' },
  sf11: { label: 'Stockfish 11 (klassisch)', path: './vendor/sf11/stockfish.js' },
};

function parseInfoLine(line) {
  if (!line.startsWith('info') || !line.includes(' pv ')) return null;

  const multipvMatch = line.match(/\bmultipv (\d+)/);
  const cpMatch = line.match(/\bscore cp (-?\d+)/);
  const mateMatch = line.match(/\bscore mate (-?\d+)/);
  const pvMatch = line.match(/\bpv (.+)$/);
  if (!pvMatch) return null;

  return {
    multipv: multipvMatch ? Number(multipvMatch[1]) : 1,
    cp: cpMatch ? Number(cpMatch[1]) : undefined,
    mate: mateMatch ? Number(mateMatch[1]) : undefined,
    pv: pvMatch[1].trim().split(' '),
  };
}

export class StockfishEngine {
  #worker = null;
  #ready = false;
  #queue = Promise.resolve();
  #pendingReject = null; // rejects the in-flight evaluate() call, if any, from terminate()

  /**
   * @param {(status: string) => void} [onStatus]
   * @param {keyof typeof ENGINES} [engineId]
   */
  async init(onStatus, engineId = 'sf19') {
    const engine = ENGINES[engineId] ?? ENGINES.sf19;
    onStatus?.(`${engine.label} wird geladen…`);
    this.#worker = new Worker(new URL(engine.path, import.meta.url));

    await new Promise((resolve, reject) => {
      // Generous: this includes downloading the engine - ~99 MB for sf19full,
      // which on a slow connection easily takes longer than the old 20 s.
      const timeout = setTimeout(
        () => reject(new Error('Engine-Initialisierung: Zeitüberschreitung (3 min)')),
        180000
      );

      const onMessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : '';
        if (line === 'uciok') {
          this.#worker.postMessage('isready');
        } else if (line === 'readyok') {
          clearTimeout(timeout);
          this.#worker.removeEventListener('message', onMessage);
          this.#worker.removeEventListener('error', onError);
          this.#pendingReject = null;
          this.#ready = true;
          resolve();
        }
      };
      const onError = (e) => {
        clearTimeout(timeout);
        this.#pendingReject = null;
        reject(new Error('Engine-Worker-Fehler: ' + (e.message || 'unbekannt')));
      };

      // Lets terminate() (e.g. the user cancelling mid-analysis, possibly
      // while the engine is still loading) reject this immediately too,
      // instead of only the per-move evaluate() calls that come after init.
      this.#pendingReject = reject;
      this.#worker.addEventListener('message', onMessage);
      this.#worker.addEventListener('error', onError);
      this.#worker.postMessage('uci');
    });

    onStatus?.(`${engine.label} bereit`);
  }

  get isReady() {
    return this.#ready;
  }

  /**
   * Evaluate a FEN position. Requests are serialized against each other.
   * @param {string} fen
   * @param {{depth?: number, multiPv?: number}} [options]
   * @returns {Promise<{bestMoveUci: string, lines: Array<{multipv:number, cp?:number, mate?:number, pv:string[]}>}>}
   */
  evaluate(fen, { depth = 14, multiPv = 2 } = {}) {
    const run = () => this.#evaluateNow(fen, depth, multiPv);
    const result = this.#queue.then(run, run);
    this.#queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  #evaluateNow(fen, depth, multiPv) {
    if (!this.#ready) return Promise.reject(new Error('Engine nicht bereit'));

    return new Promise((resolve, reject) => {
      const lines = new Map();

      const onMessage = (e) => {
        const msg = typeof e.data === 'string' ? e.data : '';
        if (msg.startsWith('bestmove')) {
          this.#worker.removeEventListener('message', onMessage);
          this.#worker.removeEventListener('error', onError);
          this.#pendingReject = null;
          const bestMoveUci = msg.split(' ')[1];
          resolve({
            bestMoveUci,
            lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv),
          });
          return;
        }
        const parsed = parseInfoLine(msg);
        if (parsed) lines.set(parsed.multipv, parsed);
      };
      const onError = (e) => {
        this.#worker.removeEventListener('message', onMessage);
        this.#pendingReject = null;
        reject(new Error('Engine-Worker-Fehler: ' + (e.message || 'unbekannt')));
      };

      this.#pendingReject = reject;
      this.#worker.addEventListener('message', onMessage);
      this.#worker.addEventListener('error', onError, { once: true });
      this.#worker.postMessage('setoption name MultiPV value ' + multiPv);
      this.#worker.postMessage('position fen ' + fen);
      this.#worker.postMessage('go depth ' + depth);
    });
  }

  /** Kills the worker outright - mid-computation, not just between moves - and
   *  rejects whatever evaluate() call is currently in flight (Worker.terminate()
   *  fires no event of its own, so that promise would otherwise hang forever). */
  terminate() {
    this.#pendingReject?.(new DOMException('Engine beendet', 'AbortError'));
    this.#pendingReject = null;
    this.#worker?.terminate();
    this.#worker = null;
    this.#ready = false;
  }
}
