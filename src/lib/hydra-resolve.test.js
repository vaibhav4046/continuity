import { describe, it, expect } from 'vitest'
import { resolveAndIngest } from './hydra-resolve.js'

// A synthetic stand-in for HydraDB: an id -> record map with the exact port
// contract the MCP server (continuity_remember) and the daemon (ingest) wire in
// — recall(text,max) returns normalized records, ingest(mem) upserts by id, and
// a same-id ingest UPDATES the record in place (which is how a supersede write
// flips status durably). Exercising resolveAndIngest through these ports is the
// remember-via-MCP path: server.mjs delegates to it with recall=hydraQuery+toMem,
// ingest=hydraIngest, uid.
function fakeHydra(seed = []) {
  const map = new Map()
  for (const r of seed) map.set(r.id, { ...r })
  let seq = 0
  const ports = {
    recall: async () => Array.from(map.values()).map((r) => ({ ...r })),
    ingest: async (mem) => {
      map.set(mem.id, {
        id: mem.id,
        content: mem.content,
        kind: mem.kind,
        entity: mem.entity || null,
        predicate: mem.predicate || null,
        salience: mem.salience,
        status: mem.status || 'active',
        superseded_by: mem.superseded_by || null,
      })
      return true
    },
    uid: (p) => p + '_test_' + (seq += 1),
  }
  return { map, ports }
}

describe('resolveAndIngest — HydraDB-direct supersede (MCP / daemon path)', () => {
  it('flips the prior contradicting memory to superseded in HydraDB', async () => {
    const { map, ports } = fakeHydra([
      { id: 'seed_morning', content: 'The user prefers morning meetings.', kind: 'preference', entity: null, predicate: 'meeting_time', salience: 0.6, status: 'active' },
    ])

    const r = await resolveAndIngest(
      { content: 'The user prefers afternoon meetings now.', kind: 'preference', entity: null, predicate: 'meeting_time', salience: 0.6 },
      ports,
    )

    // The prior value is marked superseded in the durable store, by its own id.
    expect(r.supersededIds).toContain('seed_morning')
    expect(map.get('seed_morning').status).toBe('superseded')
    expect(map.get('seed_morning').superseded_by).toBe(r.stored.id)

    // Exactly one ACTIVE memory remains in the conflict slot — the new value.
    const activeSlot = Array.from(map.values()).filter((m) => m.status === 'active' && m.predicate === 'meeting_time')
    expect(activeSlot.length).toBe(1)
    expect(activeSlot[0].content).toMatch(/afternoon/)
    expect(r.stored.id).not.toBe('seed_morning')
  })

  it('does NOT supersede a memory in a different conflict slot', async () => {
    const { map, ports } = fakeHydra([
      { id: 'seed_coffee', content: 'The user takes coffee black.', kind: 'preference', entity: null, predicate: 'coffee', salience: 0.5, status: 'active' },
    ])

    const r = await resolveAndIngest(
      { content: 'The user prefers afternoon meetings now.', kind: 'preference', entity: null, predicate: 'meeting_time', salience: 0.6 },
      ports,
    )

    expect(r.supersededIds.length).toBe(0)
    expect(map.get('seed_coffee').status).toBe('active')
    expect(Array.from(map.values()).filter((m) => m.status === 'active').length).toBe(2)
  })

  it('reinforces (does not duplicate) a near-exact restatement', async () => {
    const { map, ports } = fakeHydra([
      { id: 'seed_morning', content: 'The user prefers morning meetings.', kind: 'preference', entity: null, predicate: 'meeting_time', salience: 0.6, status: 'active' },
    ])

    const r = await resolveAndIngest(
      { content: 'The user prefers morning meetings.', kind: 'preference', entity: null, predicate: 'meeting_time', salience: 0.6 },
      ports,
    )

    expect(r.stored).toBeNull()
    expect(r.duplicateOf).toBe('seed_morning')
    expect(map.size).toBe(1)
    expect(map.get('seed_morning').status).toBe('active')
  })
})
