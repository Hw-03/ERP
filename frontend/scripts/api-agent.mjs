import http from 'node:http';
import https from 'node:https';
import { performance } from 'node:perf_hooks';

export const API_IDLE_TIMEOUT_MS = 1000;

/** Create a backend-only pool; timers never impose a deadline on active work.
 * @param {'http:' | 'https:'} protocol
 * @param {{idleTimeoutMs?: number}} options
 * @returns {http.Agent & {pruneExpired(): void, idleAge(request: http.ClientRequest): number}}
 */
export function createApiAgent(protocol, { idleTimeoutMs = API_IDLE_TIMEOUT_MS } = {}) {
  const Base = protocol === 'https:' ? https.Agent : http.Agent;
  return new class extends Base {
    idle = new Map();
    reusedAges = new WeakMap();

    constructor() {
      super({ keepAlive: true, scheduling: 'lifo', maxSockets: 256, maxFreeSockets: 64 });
    }

    /** Record idle time only after Node decides to retain the socket.
     * @param {import('node:net').Socket} socket
     * @returns {boolean}
     */
    keepSocketAlive(socket) {
      // Node 20 returns a boolean here; the pinned @types/node still says void.
      if (Reflect.apply(Base.prototype.keepSocketAlive, this, [socket]) === false) return false;
      const timer = setTimeout(() => socket.destroy(), idleTimeoutMs);
      timer.unref();
      const onClose = () => this.clearIdle(socket);
      this.idle.set(socket, { since: performance.now(), timer, onClose });
      socket.once('close', onClose);
      return true;
    }

    /** Cancel expiry before Node assigns the socket to active work.
     * @param {import('node:net').Socket} socket
     * @param {http.ClientRequest} request
     * @returns {void}
     */
    reuseSocket(socket, request) {
      const now = performance.now();
      this.reusedAges.set(request, now - (this.idle.get(socket)?.since ?? now));
      this.clearIdle(socket);
      super.reuseSocket(socket, request);
    }

    /** Timers may be delayed by compilation; check synchronously before dispatch.
     * @returns {void}
     */
    pruneExpired() {
      const now = performance.now();
      for (const [socket, { since }] of this.idle) {
        if (socket.destroyed || socket.readableEnded || now - since >= idleTimeoutMs) {
          this.clearIdle(socket);
          socket.destroy();
        }
      }
    }

    /** Return only a duration for safe transport diagnostics.
     * @param {http.ClientRequest} request
     * @returns {number}
     */
    idleAge(request) { return this.reusedAges.get(request) ?? 0; }

    /** @param {import('node:net').Socket} socket @returns {void} */
    clearIdle(socket) {
      const state = this.idle.get(socket);
      clearTimeout(state?.timer);
      if (state) socket.removeListener('close', state.onClose);
      this.idle.delete(socket);
    }

    /** Release idle timers as well as the sockets owned by Node. @returns {void} */
    destroy() {
      for (const socket of this.idle.keys()) this.clearIdle(socket);
      super.destroy();
    }
  }();
}
