// engine.js — the 7-stage Memory Engine orchestrator.
// Capture -> Extract(brain) -> Resolve -> Decay -> Retrieve -> Surface -> Act.
// In-memory working set drives instant deterministic visuals; HydraDB is the
// durable primary, genuinely written to and queried on every capture/recall
// (fire-and-forget so the hot path never stalls), with full execution logging.

import { InMemoryStore, makeMemory } from './memory-store.js'
import { HydraClient } from './hydra-client.js'
import { derivePredicate } from './brain.js'
import {
  embed, cosine, effectiveSalience, recencyScore, now, uid, clamp01,
  WEIGHTS, ARCHIVE_THRESHOLD,
} from './engine-core.js'

// ---- RESOLVE: dedupe + contradiction handling (new value supersedes old) ----
export function resolveMemory(store, draftMem) {
  const mem = { ...draftMem }
  if (!mem.predicate) return { stored: store.add(mem), superseded: [], duplicateOf: null }

  const candidates = store.all().filter(
    (c) => c.status === 'active' && c.predicate === mem.predicate &&
      (c.entity || null) === (mem.entity || null) && c.id !== mem.id,
  )
  const superseded = []
  for (const c of candidates) {
    const sim = cosine(mem.embedding, c.embedding)
    if (sim > 0.96) {
      // same thing restated -> reinforce the existing one, drop the new
      store.update(c.id, { last_reinforced: now(), salience: Math.min(1, c.salience + 0.05) })
      return { stored: null, superseded: [], duplicateOf: c.id }
    }
    store.update(c.id, { status: 'superseded', superseded_by: mem.id })
    superseded.push(c.id)
  }
  return { stored: store.add(mem), superseded, duplicateOf: null }
}

// ---- DECAY: archive whatever has faded below threshold ----
export function runDecay(store, at = now()) {
  const archived = []
  for (const m of store.all()) {
    if (m.status !== 'active') continue
    if (effectiveSalience(m, at) < ARCHIVE_THRESHOLD) {
      store.update(m.id, { status: 'archived' })
      archived.push(m.id)
    }
  }
  return archived
}

// ---- RETRIEVE: weighted scoring (not cosine top-k), return top k ----
export function retrieve(store, query, k = 5, at = now()) {
  const qEmb = embed(query)
  const q = query.toLowerCase()
  return store.all()
    .filter((m) => m.status === 'active')
    .map((m) => {
      const semantic = cosine(qEmb, m.embedding)
      const salience = effectiveSalience(m, at)
      const recency = recencyScore(m, at)
      const entityMatch = m.entity && q.indexOf(m.entity.toLowerCase()) !== -1 ? 1 : 0
      const openLoop = m.kind === 'open_loop' ? 1 : 0
      const score = WEIGHTS.semantic * semantic + WEIGHTS.salience * salience +
        WEIGHTS.recency * recency + WEIGHTS.entity * entityMatch + WEIGHTS.openLoop * openLoop
      return { mem: m, score, parts: { semantic, salience, recency, entityMatch, openLoop } }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

// ---- SURFACE: proactively rank open loops (due-soonest, then salience) ----
export function surfaceOpenLoops(store, at = now()) {
  return store.all()
    .filter((m) => m.kind === 'open_loop' && m.status === 'active')
    .map((m) => ({ mem: m, eff: effectiveSalience(m, at) }))
    .sort((a, b) => {
      const ad = a.mem.due_hint || Infinity
      const bd = b.mem.due_hint || Infinity
      if (ad !== bd) return ad - bd
      return b.eff - a.eff
    })
    .map((x) => x.mem)
}

export function greetingFor(mem) {
  if (!mem) return "You're all caught up — no open loops on my mind. What's new?"
  const who = mem.entity || 'that'
  return 'Welcome back. Did you hear back from ' + who + '? Want me to draft a follow-up?'
}

// ---- ORCHESTRATOR ----
export class ContinuityEngine {
  constructor({ config = {}, log }) {
    this.store = new InMemoryStore()
    this.log = log
    this.hydra = new HydraClient(config.hydra || {}, log)
    this.actions = []
    this.lastRetrieval = []
    this.log.event({
      op: 'system',
      store: this.hydra.configured ? 'hydradb' : 'local',
      detail: this.hydra.configured
        ? 'HydraDB connected · tenant=' + this.hydra.tenantId + ' · durable primary + working-set mirror'
        : 'HydraDB key not set — in-memory safety net active (set VITE_HYDRA_API_KEY to enable the primary)',
    })
  }

  storeStatus() {
    return this.hydra.configured && this.hydra.healthy ? 'hydradb' : 'local'
  }

  seedLocal(drafts) {
    for (const d of drafts) {
      this.store.add(makeMemory({ ...d, embedding: embed(d.content) }))
    }
    this.log.event({ op: 'system', store: 'local', detail: 'seeded ' + drafts.length + ' memories into the working set' })
  }

  // On startup: if HydraDB holds this user's memories from a previous session,
  // RESTORE them (the amnesia-proof moment). If HydraDB is empty (first run),
  // persist the local seed so the next session restores it. If HydraDB is
  // unconfigured or the call fails, keep the local seed (laid down first, so
  // there is never an empty flash).
  async bootstrapFromHydra() {
    if (!this.hydra.configured) return { mode: 'local' }
    const res = await this.hydra.loadAll()
    if (res.ok && res.memories.length) {
      this.store.clear()
      for (const m of res.memories) this.store.add({ ...m, embedding: embed(m.content) })
      this.log.event({ op: 'system', store: 'hydradb', detail: 'restored ' + res.memories.length + ' memories from a previous session via HydraDB' })
      return { mode: 'restored', count: res.memories.length, requestId: res.requestId || null }
    }
    if (res.ok) {
      const seeded = this.store.all()
      seeded.forEach((m) => { void this.hydra.ingest(m) })
      this.log.event({ op: 'system', store: 'hydradb', detail: 'first session — persisted ' + seeded.length + ' memories to HydraDB for next time' })
      return { mode: 'seeded', count: seeded.length }
    }
    return { mode: 'local' }
  }

  // Fetch HydraDB's extracted knowledge graph for the seeded memories.
  async loadGraph() {
    if (!this.hydra.configured) return { nodes: [], edges: [] }
    return this.hydra.graph('user memories katie daniel interview lease meetings coffee preferences')
  }

  async ingest(text, brain) {
    // Retrieve (local scoring = shown ranking) + durable Hydra recall (proof).
    const retrieved = retrieve(this.store, text, 5)
    this.lastRetrieval = retrieved
    void this.hydra.query(text, 5)
    for (const r of retrieved) {
      this.store.update(r.mem.id, { last_reinforced: now(), salience: Math.min(1, r.mem.salience + 0.03) })
    }
    const contextMems = retrieved.map((r) => r.mem)

    const result = await brain(contextMems, text)

    const captured = []
    const supersededIds = []
    for (const md of result.memories || []) {
      // Normalize to a clean third-person statement (LLMs sometimes drop the
      // subject) and always derive the conflict predicate locally so
      // contradiction/supersede behaves identically for LLM and heuristic.
      let content = (md.content || '').trim()
      if (/^[a-z]/.test(content)) content = 'The user ' + content
      const kind = md.kind || 'fact'
      // Guard untrusted LLM output at the boundary: clamp salience, reject NaN dates.
      const salNum = Number(md.salience)
      const tNum = md.time_hint ? Date.parse(md.time_hint) : NaN
      const mem = makeMemory({
        content,
        kind,
        salience: clamp01(Number.isFinite(salNum) ? salNum : 0.5),
        entity: md.entity || null,
        predicate: md.predicate || derivePredicate(content, kind),
        due_hint: Number.isFinite(tNum) ? tNum : (md.due_hint || null),
        embedding: embed(content),
      })
      const res = resolveMemory(this.store, mem)
      if (res.superseded.length) {
        supersededIds.push(...res.superseded)
        res.superseded.forEach((id) => { const c = this.store.get(id); if (c) void this.hydra.ingest(c) })
      }
      if (res.stored) { captured.push(res.stored); void this.hydra.ingest(res.stored) }
    }

    let action = null
    if (result.action && result.action.type === 'email_draft') {
      const target = this._linkActionTarget(result.action, captured, contextMems)
      action = {
        id: uid('act'),
        memory_id: target ? target.id : null,
        type: 'email_draft',
        payload: { to: result.action.to || '', subject: result.action.subject || '', body: result.action.body || '' },
        status: 'draft',
        created_at: now(),
      }
      this.actions.push(action)
    }

    return { reply: result.reply, captured, supersededIds, action, retrieved, source: result.source }
  }

  _linkActionTarget(action, captured, contextMems) {
    const pool = [...contextMems, ...captured].filter((m) => m.kind === 'open_loop' && m.status !== 'resolved')
    if (action.to) {
      const hit = pool.find((m) => m.entity && action.to.toLowerCase().indexOf(m.entity.toLowerCase()) !== -1)
      if (hit) return hit
    }
    return pool[0] || null
  }

  newSession() {
    const loops = surfaceOpenLoops(this.store)
    const top = loops[0] || null
    if (top) {
      this.store.update(top.id, { last_reinforced: now() })
      void this.hydra.query(('open loop follow up ' + (top.entity || '')).trim(), 3)
    }
    return { greeting: greetingFor(top), focus: top }
  }

  sendAction(actionId) {
    const action = this.actions.find((a) => a.id === actionId)
    if (!action) return null
    action.status = 'sent'
    action.type = 'email_sent'
    if (action.memory_id) {
      const updated = this.store.update(action.memory_id, { status: 'resolved' })
      if (updated) void this.hydra.ingest(updated)
    }
    return action
  }

  tick() {
    const archived = runDecay(this.store)
    archived.forEach((id) => { const m = this.store.get(id); if (m) void this.hydra.ingest(m) })
    return this.snapshot()
  }

  snapshot(at = now()) {
    const memories = this.store.all().map((m) => ({ ...m, eff: effectiveSalience(m, at) }))
    return {
      storeStatus: this.storeStatus(),
      hydraConfigured: this.hydra.configured,
      memories,
      openLoops: surfaceOpenLoops(this.store),
      actions: [...this.actions],
      lastRetrieval: this.lastRetrieval.map((r) => ({ id: r.mem.id, score: r.score, parts: r.parts })),
    }
  }
}
