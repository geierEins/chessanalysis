// A minimal stand-in for the browser's Web Worker, so the app's own
// js/engine/stockfishEngine.js runs unchanged under Node: the vendored
// Stockfish build doubles as a UCI command-line program when started with
// node, so each "worker" is a child process - postMessage() writes a line to
// its stdin, every stdout line arrives as a 'message' event.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export class NodeWorker extends EventTarget {
  #child;
  #terminated = false;

  /** @param {URL|string} url the engine script, as StockfishEngine passes it */
  constructor(url) {
    super();
    this.#child = spawn(process.execPath, [fileURLToPath(url)], { stdio: ['pipe', 'pipe', 'inherit'] });
    createInterface({ input: this.#child.stdout }).on('line', (line) => {
      this.dispatchEvent(new MessageEvent('message', { data: line }));
    });
    this.#child.on('error', (err) => this.#fail(err.message));
    this.#child.on('exit', (code) => this.#fail(`Engine-Prozess beendet (Code ${code})`));
  }

  #fail(message) {
    if (this.#terminated) return;
    this.dispatchEvent(Object.assign(new Event('error'), { message }));
  }

  postMessage(command) {
    this.#child.stdin.write(`${command}\n`);
  }

  terminate() {
    this.#terminated = true;
    this.#child.kill();
  }
}
