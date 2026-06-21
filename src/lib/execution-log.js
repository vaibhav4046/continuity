// execution-log.js — pub/sub ring buffer recording every HydraDB write/query
// with timestamps + latency. This IS the "execution-log" deliverable: visible
// proof the agent autonomously wrote to and queried HydraDB.

const MAX = 60
let _seq = 0

export class ExecutionLog {
  constructor() {
    this.entries = []
    this._subs = new Set()
  }
  subscribe(fn) {
    this._subs.add(fn)
    return () => this._subs.delete(fn)
  }
  _emit() {
    const snap = [...this.entries]
    this._subs.forEach((fn) => fn(snap))
  }
  _push(entry) {
    this.entries.push(entry)
    if (this.entries.length > MAX) this.entries.shift()
  }
  start({ op, store, detail }) {
    _seq += 1
    const entry = {
      id: 'log_' + _seq,
      ts: new Date().toISOString(),
      t0: performance.now(),
      op, store, status: 'pending',
      detail: detail || '', latency_ms: null, request_id: null,
    }
    this._push(entry)
    this._emit()
    console.info('[hydra] ' + op + ' ' + store + ' …', detail || '')
    return {
      ok: (patch = {}) => this._finish(entry, 'ok', patch),
      error: (patch = {}) => this._finish(entry, 'error', patch),
      skip: (patch = {}) => this._finish(entry, 'skipped', patch),
    }
  }
  _finish(entry, status, patch) {
    entry.status = status
    entry.latency_ms = Math.round(performance.now() - entry.t0)
    if (patch.detail) entry.detail = patch.detail
    if (patch.request_id) entry.request_id = patch.request_id
    console.info('[hydra] ' + entry.op + ' ' + entry.store + ' ' + status + ' ' + entry.latency_ms + 'ms', entry.detail)
    this._emit()
  }
  event({ op, store, status, detail }) {
    _seq += 1
    this._push({
      id: 'log_' + _seq, ts: new Date().toISOString(),
      op, store, status: status || 'ok', detail: detail || '', latency_ms: null, request_id: null,
    })
    console.info('[hydra] ' + op + ' ' + store + ' ' + (status || 'ok'), detail || '')
    this._emit()
  }
  list() { return [...this.entries] }
}
