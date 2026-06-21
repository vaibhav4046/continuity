import { describe, it, expect } from 'vitest'
import { InMemoryStore, makeMemory } from './memory-store.js'
import { resolveMemory, runDecay, retrieve } from './engine.js'
import { derivePredicate } from './brain.js'
import { reconstructMemory } from './hydra-client.js'
import { embed } from './engine-core.js'

const mem = (o) => makeMemory({ ...o, embedding: embed(o.content) })

describe('resolveMemory — contradiction / supersede', () => {
  it('supersedes same entity+predicate with a different value', () => {
    const store = new InMemoryStore()
    store.add(mem({ content: 'The user prefers morning meetings.', kind: 'preference', entity: null, predicate: 'meeting_time', salience: 0.6 }))
    const res = resolveMemory(store, mem({ content: 'The user prefers afternoon meetings now.', kind: 'preference', entity: null, predicate: 'meeting_time', salience: 0.6 }))
    expect(res.superseded.length).toBe(1)
    expect(store.all().filter((m) => m.status === 'active' && m.predicate === 'meeting_time').length).toBe(1)
  })

  it('does NOT cross-supersede unrelated memories (no predicate)', () => {
    const store = new InMemoryStore()
    store.add(mem({ content: 'The user takes coffee black.', kind: 'preference', predicate: 'coffee', salience: 0.5 }))
    resolveMemory(store, mem({ content: 'The user likes green tea.', kind: 'preference', predicate: null, salience: 0.5 }))
    expect(store.all().filter((m) => m.status === 'active').length).toBe(2)
  })
})

describe('runDecay', () => {
  it('archives a memory whose effective salience falls below threshold', () => {
    const store = new InMemoryStore()
    const old = mem({ content: 'it was sunny today', kind: 'chatter', salience: 0.26 })
    old.last_reinforced = Date.now() - 1000 * 1000
    store.add(old)
    runDecay(store)
    expect(store.all()[0].status).toBe('archived')
  })
})

describe('retrieve — weighted scoring', () => {
  it('ranks an entity-matching open loop above an unrelated fact', () => {
    const store = new InMemoryStore()
    store.add(mem({ content: 'The user has an interview with Katie.', kind: 'open_loop', entity: 'Katie', predicate: 'interview', salience: 0.9 }))
    store.add(mem({ content: 'The user likes the colour blue.', kind: 'fact', salience: 0.4 }))
    const top = retrieve(store, 'any update on Katie?', 5)
    expect(top[0].mem.entity).toBe('Katie')
  })
})

describe('reconstructMemory — HydraDB string-metadata round-trip', () => {
  it('parses string metadata back into a full memory (id, salience, due_hint)', () => {
    const m = reconstructMemory({
      chunk_content: 'The user has an interview with Katie at Northwind on Tuesday.',
      metadata: { app: 'continuity', kind: 'open_loop', status: 'active', mem_id: 'seed_katie', salience: '0.9', entity: 'Katie', predicate: 'interview', due_hint: '1782072084000' },
      additional_metadata: null,
    })
    expect(m.id).toBe('seed_katie')
    expect(m.salience).toBeCloseTo(0.9)
    expect(m.due_hint).toBe(1782072084000)
    expect(m.kind).toBe('open_loop')
    expect(m.entity).toBe('Katie')
  })
})

describe('predicate reachability — guards the non-Katie dead-slot bug', () => {
  it('derives a predicate for every seeded open-loop phrasing', () => {
    expect(derivePredicate('The user is waiting to hear back from Daniel about the lease.')).toBeTruthy()
    expect(derivePredicate('The user has an interview with Katie.')).toBe('interview')
  })
})
