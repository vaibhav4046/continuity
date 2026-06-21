// hydra-client.js — REAL HydraDB v2 REST client. The mandatory primary store.
//   Write:  POST https://api.hydradb.com/context/ingest  (multipart/form-data)
//   Query:  POST https://api.hydradb.com/query            (application/json)
//   Docs:   https://docs.hydradb.com
//
// SECURITY NOTE: a Vite env key is bundled into client JS and is publicly
// visible in the browser bundle. Acceptable ONLY for a local hackathon demo.
// For production, proxy these calls through a thin backend and keep the key
// server-side. Every call is wrapped in try/catch and logged; failures fall
// back to the in-memory working set so the live demo never dies.

// Same-origin path proxied to https://api.hydradb.com by the Vite dev server
// (vite.config.js) — HydraDB has no browser CORS, so direct calls are blocked.
const BASE = '/hydra'

function trunc(s = '', n = 44) {
  s = String(s)
  return s.length > n ? s.slice(0, n) + '…' : s
}

function parseObj(v) {
  if (!v) return {}
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch (e) { return {} }
}

// Rebuild a memory record from a HydraDB query chunk (the inverse of ingest).
// Embedding is left empty; the engine recomputes it on restore.
export function reconstructMemory(chunk) {
  if (!chunk || !chunk.chunk_content) return null
  const meta = parseObj(chunk.metadata)
  const add = parseObj(chunk.additional_metadata)
  // HydraDB metadata preserves string values only, so numerics round-trip as
  // strings — parse them back, falling back sensibly.
  const salRaw = meta.salience != null ? Number(meta.salience) : (typeof add.salience === 'number' ? add.salience : NaN)
  const salience = Number.isFinite(salRaw) ? salRaw : 0.5
  const dueRaw = meta.due_hint != null ? Number(meta.due_hint) : NaN
  const createdRaw = meta.created_at != null ? Number(meta.created_at) : NaN
  return {
    // Read the original id + fields from metadata first (they round-trip there);
    // hash only as a last resort so engine linkage (resolve/supersede) survives.
    id: meta.mem_id || chunk.id || chunk.chunk_uuid || ('mem_h_' + Math.abs((((chunk.chunk_content || '').length * 2654435761) | 0))),
    user_id: 'demo-user',
    content: chunk.chunk_content,
    kind: meta.kind || 'fact',
    entity: meta.entity || null,
    predicate: meta.predicate || null,
    salience,
    status: meta.status || 'active',
    superseded_by: null,
    due_hint: Number.isFinite(dueRaw) ? dueRaw : (add.due_hint || null),
    last_reinforced: Date.now(),
    embedding: [],
    created_at: Number.isFinite(createdRaw) ? createdRaw : (Date.parse(chunk.source_upload_time) || Date.now()),
  }
}

export class HydraClient {
  constructor(config = {}, log) {
    this.apiKey = config.apiKey || ''
    this.tenantId = config.tenantId || 'default-tenant'
    this.subTenantId = config.subTenantId || 'demo-user'
    this.log = log
    this.configured = Boolean(this.apiKey)
    this.healthy = this.configured
  }

  _headers(extra) {
    return Object.assign({ Authorization: 'Bearer ' + this.apiKey, 'API-Version': '2' }, extra || {})
  }

  // A rejected/expired key (401/403) means every future call will also fail.
  // Disable HydraDB after the first auth failure so the demo degrades to one
  // clean line + the local working set, instead of spamming errors per op.
  _maybeDisable(err) {
    if (this.configured && /\b(401|403)\b/.test(String(err.message))) {
      this.configured = false
      this.authFailed = true
      this.log.event({ op: 'system', store: 'local', status: 'error', detail: 'HydraDB key rejected (auth) — disabled for this session, running on local working set' })
    }
  }

  // Durable write of one memory. infer:false -> store our exact text; our
  // deterministic engine owns extraction. Fire-and-forget from the hot path.
  async ingest(mem) {
    if (!this.configured) {
      this.log.event({ op: 'write', store: 'local', status: 'skipped', detail: 'ingest "' + trunc(mem.content) + '" — ' + (this.authFailed ? 'HydraDB unavailable (key rejected)' : 'no HydraDB key') + ', kept local' })
      return { ok: false, skipped: true }
    }
    const h = this.log.start({ op: 'write', store: 'hydradb', detail: 'ingest "' + trunc(mem.content) + '"' })
    try {
      const form = new FormData()
      form.append('type', 'memory')
      form.append('tenant_id', this.tenantId)
      form.append('sub_tenant_id', this.subTenantId)
      form.append('memories', JSON.stringify([{
        text: mem.content,
        infer: false,
        title: mem.kind,
        id: mem.id,
        // Everything needed to REBUILD the memory goes in metadata — the
        // /query response returns metadata but null additional_metadata, so
        // salience/due_hint/id must live here to survive a cross-session
        // restore. HydraDB rejects null values, so omit unset fields.
        metadata: {
          app: 'continuity',
          kind: mem.kind,
          status: mem.status,
          mem_id: mem.id,
          salience: String(mem.salience),
          ...(mem.entity ? { entity: mem.entity } : {}),
          ...(mem.predicate ? { predicate: mem.predicate } : {}),
          ...(mem.due_hint ? { due_hint: String(mem.due_hint) } : {}),
          ...(mem.created_at ? { created_at: String(mem.created_at) } : {}),
        },
        additional_metadata: { salience: mem.salience },
      }]))
      const resp = await fetch(BASE + '/context/ingest', { method: 'POST', headers: this._headers(), body: form })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      const data = await resp.json().catch(() => ({}))
      const reqId = (data && data.meta && data.meta.request_id) || (data && data.data && data.data.results && data.data.results[0] && data.data.results[0].id) || null
      this.healthy = true
      h.ok({ detail: 'ingest ok · ' + (((data || {}).data || {}).success_count != null ? data.data.success_count : 1) + ' queued', request_id: reqId })
      return { ok: true, data }
    } catch (err) {
      this.healthy = false
      this._maybeDisable(err)
      h.error({ detail: 'ingest failed: ' + err.message + ' — fell back to local' })
      return { ok: false, error: err.message }
    }
  }

  // Durable semantic recall. Used as the execution-log proof; the engine still
  // computes the SHOWN ranking locally for instant, deterministic visuals.
  async query(text, max = 5) {
    if (!this.configured) {
      this.log.event({ op: 'query', store: 'local', status: 'skipped', detail: 'recall "' + trunc(text) + '" — ' + (this.authFailed ? 'HydraDB unavailable, ' : '') + 'local scoring only' })
      return { ok: false, skipped: true, chunks: [] }
    }
    const h = this.log.start({ op: 'query', store: 'hydradb', detail: 'recall "' + trunc(text) + '"' })
    try {
      const resp = await fetch(BASE + '/query', {
        method: 'POST',
        headers: this._headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          tenant_id: this.tenantId,
          sub_tenant_id: this.subTenantId,
          query: text,
          type: 'memory',
          query_by: 'hybrid',
          mode: 'fast',
          max_results: max,
          recency_bias: 0.3,
        }),
      })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      const data = await resp.json().catch(() => ({}))
      const chunks = (data && data.data && data.data.chunks) || []
      const reqId = (data && data.meta && data.meta.request_id) || null
      const lat = data && data.meta && data.meta.latency_ms
      this.healthy = true
      h.ok({ detail: 'recall ok · ' + chunks.length + ' chunks' + (lat != null ? ' · srv ' + lat + 'ms' : ''), request_id: reqId })
      return { ok: true, chunks }
    } catch (err) {
      this.healthy = false
      this._maybeDisable(err)
      h.error({ detail: 'recall failed: ' + err.message + ' — local scoring used' })
      return { ok: false, error: err.message, chunks: [] }
    }
  }

  // Restore the user's whole memory set from HydraDB on session start — the
  // cross-session "remember after the tab closes" proof. Returns rebuilt memory
  // records (no embedding; the engine recomputes those).
  async loadAll(max = 50) {
    if (!this.configured) return { ok: false, memories: [] }
    const h = this.log.start({ op: 'query', store: 'hydradb', detail: 'restore session — recall all memories' })
    try {
      const resp = await fetch(BASE + '/query', {
        method: 'POST',
        headers: this._headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          tenant_id: this.tenantId,
          sub_tenant_id: this.subTenantId,
          query: 'user memories preferences facts open loops follow ups interviews',
          type: 'memory',
          query_by: 'hybrid',
          mode: 'fast',
          max_results: max,
          recency_bias: 0.2,
        }),
      })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      const data = await resp.json().catch(() => ({}))
      const chunks = (data && data.data && data.data.chunks) || []
      // Keep only THIS app's memories — the shared tenant may hold unrelated
      // test data. Client-side filter is robust to server filter semantics and
      // self-heals on index lag (an empty result re-persists the local seed).
      const mine = chunks.filter((c) => parseObj(c.metadata).app === 'continuity')
      // Dedup by content — HydraDB can return one memory as several ranked
      // chunks; collapse them so restore shows each memory exactly once.
      const seen = new Set()
      const memories = []
      for (const c of mine) {
        const m = reconstructMemory(c)
        if (!m) continue
        const key = (m.content || '').trim().toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        memories.push(m)
      }
      const requestId = (data.meta || {}).request_id || null
      this.healthy = true
      h.ok({ detail: 'restored ' + memories.length + ' memories from HydraDB', request_id: requestId })
      return { ok: true, memories, requestId }
    } catch (err) {
      this.healthy = false
      this._maybeDisable(err)
      h.error({ detail: 'restore failed: ' + err.message + ' — using local seed' })
      return { ok: false, memories: [] }
    }
  }

  // Pull HydraDB's extracted entity-relation graph for the current memories —
  // proves we use HydraDB's knowledge-graph layer, not just key/value recall.
  async graph(text) {
    if (!this.configured) return { ok: false, nodes: [], edges: [] }
    const h = this.log.start({ op: 'query', store: 'hydradb', detail: 'graph recall "' + trunc(text) + '"' })
    try {
      const resp = await fetch(BASE + '/query', {
        method: 'POST',
        headers: this._headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          tenant_id: this.tenantId,
          sub_tenant_id: this.subTenantId,
          query: text,
          type: 'memory',
          query_by: 'hybrid',
          mode: 'thinking',
          max_results: 10,
          graph_context: true,
        }),
      })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      const data = await resp.json().catch(() => ({}))
      const paths = (data.data && data.data.graph_context && data.data.graph_context.query_paths) || []
      const nodeMap = new Map()
      const edgeKey = new Set()
      const edges = []
      for (const p of paths) {
        for (const t of (p.triplets || [])) {
          if (t.source && t.source.name) nodeMap.set(t.source.name, { id: t.source.name, name: t.source.name, type: t.source.type || 'ENTITY' })
          if (t.target && t.target.name) nodeMap.set(t.target.name, { id: t.target.name, name: t.target.name, type: t.target.type || 'ENTITY' })
          if (t.source && t.target && t.source.name && t.target.name) {
            const label = (t.relation && t.relation.raw_predicate) || ''
            const k = t.source.name + '|' + t.target.name + '|' + label
            if (!edgeKey.has(k)) { edgeKey.add(k); edges.push({ source: t.source.name, target: t.target.name, label }) }
          }
        }
      }
      const nodes = Array.from(nodeMap.values())
      this.healthy = true
      h.ok({ detail: nodes.length ? ('graph · ' + nodes.length + ' entities · ' + edges.length + ' relations') : 'graph_context sparse · deriving from memory', request_id: (data.meta || {}).request_id || null })
      return { ok: true, nodes, edges }
    } catch (err) {
      this.healthy = false
      this._maybeDisable(err)
      h.error({ detail: 'graph recall failed: ' + err.message })
      return { ok: false, nodes: [], edges: [] }
    }
  }
}
