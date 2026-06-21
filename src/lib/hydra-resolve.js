// hydra-resolve.js — the SHARED resolve step for the HydraDB-direct write paths.
//
// The web app routes every capture through engine.js resolveMemory(), so a new
// value supersedes the contradicted one — the product's "supersedes itself on
// contradiction" claim. The MCP server (continuity_remember) and the daemon
// (ingest) used to write straight to HydraDB and SKIP that step, so telling the
// agent "I prefer afternoon meetings now" left the old "morning meetings" memory
// active alongside the new one. Both contradicted the headline claim.
//
// This re-runs the EXACT engine resolve against the durable store so all three
// paths behave identically: pull the active memories that share the new memory's
// entity+predicate conflict slot, let resolveMemory() decide (reinforce a
// near-duplicate, or supersede the prior value), then persist every status
// change back to HydraDB BY ID (a same-id ingest updates the record in place).
//
// derivePredicate() gives the conflict slot deterministically, so LLM-extracted
// and heuristic-extracted memories resolve the same way.

import { InMemoryStore } from './memory-store.js'
import { resolveMemory } from './engine.js'
import { derivePredicate } from './brain.js'
import { embed, clamp01, now } from './engine-core.js'

/**
 * Resolve a freshly extracted memory against HydraDB's active memories, then
 * persist the new memory plus any supersede updates.
 *
 * @param {{ content: string, kind?: string, entity?: string|null, predicate?: string|null, salience?: number, due_hint?: number|null }} draft
 * @param {{ recall: (text: string, max: number) => Promise<Array<object>>, ingest: (mem: object) => Promise<*>, uid: (prefix: string) => string }} ports
 *   recall — return normalized memory records ({ id, content, kind, entity, predicate, salience, status }) near `text`.
 *   ingest — upsert one memory by `mem.id` (HydraDB updates the record in place when the id already exists).
 *   uid    — generate a fresh memory id.
 * @returns {Promise<{ stored: object|null, supersededIds: string[], duplicateOf: string|null }>}
 */
export async function resolveAndIngest(draft, ports) {
  const content = String(draft.content || '').trim()
  const kind = draft.kind || 'fact'
  const predicate = draft.predicate || derivePredicate(content)
  const salNum = Number(draft.salience)
  const salience = clamp01(Number.isFinite(salNum) ? salNum : 0.5)

  const store = new InMemoryStore()
  // Only a predicate (a real conflict slot) can drive a supersede, so only pay
  // for the recall when one exists. Load the slot's current ACTIVE memories,
  // preserving each HydraDB id so a supersede write updates the same record
  // rather than spawning a copy.
  if (predicate) {
    const found = await ports.recall((content + ' ' + (draft.entity || '')).trim(), 50)
    for (const c of (found || [])) {
      if (!c || !c.id || (c.status && c.status !== 'active')) continue
      const cSal = Number(c.salience)
      store.add({
        id: c.id,
        content: c.content || '',
        kind: c.kind || 'fact',
        entity: c.entity == null ? null : c.entity,
        predicate: c.predicate || null,
        salience: Number.isFinite(cSal) ? cSal : 0.5,
        status: 'active',
        superseded_by: null,
        last_reinforced: now(),
        embedding: embed(c.content || ''),
        created_at: now(),
      })
    }
  }

  const mem = {
    id: ports.uid('mem'),
    content,
    kind,
    entity: draft.entity == null ? null : draft.entity,
    predicate: predicate || null,
    salience,
    status: 'active',
    superseded_by: null,
    due_hint: draft.due_hint == null ? null : draft.due_hint,
    last_reinforced: now(),
    embedding: embed(content),
    created_at: now(),
  }

  const res = resolveMemory(store, mem)

  // Persist every contradicted memory's flipped status (same id -> in-place update).
  const supersededIds = []
  for (const id of res.superseded) {
    const c = store.get(id)
    if (!c) continue
    await ports.ingest(c)
    supersededIds.push(id)
  }

  // Near-exact restatement: resolveMemory reinforced the existing one and dropped
  // the new draft — nothing new to write, mirroring the web path.
  if (res.duplicateOf) return { stored: null, supersededIds, duplicateOf: res.duplicateOf }

  if (res.stored) await ports.ingest(res.stored)
  return { stored: res.stored, supersededIds, duplicateOf: null }
}
