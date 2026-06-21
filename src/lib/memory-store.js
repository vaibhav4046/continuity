// memory-store.js — the in-app working set (hot tier). HydraDB is the durable
// primary written/queried alongside it (see hydra-client.js + engine.js).

import { uid, now } from './engine-core.js'

export class InMemoryStore {
  constructor() { this._map = new Map() }
  add(mem) { const r = { ...mem }; this._map.set(r.id, r); return { ...r } }
  update(id, patch) {
    const c = this._map.get(id)
    if (!c) return null
    const n = { ...c, ...patch }
    this._map.set(id, n)
    return { ...n }
  }
  get(id) { const m = this._map.get(id); return m ? { ...m } : null }
  all() { return Array.from(this._map.values()).map((m) => ({ ...m })) }
  clear() { this._map.clear() }
}

export function makeMemory(partial) {
  const t = now()
  return {
    id: uid('mem'),
    user_id: partial.user_id || 'demo-user',
    content: partial.content || '',
    kind: partial.kind || 'fact',
    entity: partial.entity == null ? null : partial.entity,
    predicate: partial.predicate == null ? null : partial.predicate,
    salience: typeof partial.salience === 'number' ? partial.salience : 0.5,
    status: partial.status || 'active',
    superseded_by: null,
    due_hint: partial.due_hint == null ? null : partial.due_hint,
    last_reinforced: partial.last_reinforced || t,
    embedding: partial.embedding || [],
    created_at: partial.created_at || t,
  }
}
