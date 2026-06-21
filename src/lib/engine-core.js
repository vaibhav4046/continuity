// engine-core.js — primitives shared across the Memory Engine.
// Zero dependencies, zero cloud: deterministic embedding, similarity, decay.

export const WEIGHTS = {
  semantic: 0.40,
  salience: 0.25,
  recency: 0.15,
  entity: 0.10,
  openLoop: 0.10,
}

// Decay time-constants (ms). Scaled for a live demo so the Engine panel
// visibly breathes on camera: chatter evaporates within a minute, open
// loops persist, preferences fade slowly. (Production would use days.)
const SEC = 1000
export const TAU = {
  open_loop: 3600 * SEC,
  preference: 1200 * SEC,
  fact: 300 * SEC,
  chatter: 45 * SEC,
}
export const TAU_RECENCY = 240 * SEC
export const ARCHIVE_THRESHOLD = 0.08
export const SUPERSEDE_SIM = 0.82
export const ADJUDICATE_LOW = 0.62
export const EMBED_DIM = 96

let _counter = 0
export function uid(prefix = 'm') {
  _counter += 1
  const rand = Math.floor(performance.now() * 1000) % 100000
  return prefix + '_' + _counter + '_' + rand
}

export const now = () => Date.now()
export const clamp01 = (n) => Math.max(0, Math.min(1, n))

function hashToken(token) {
  let h = 2166136261
  for (let i = 0; i < token.length; i += 1) {
    h ^= token.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

const STOP = new Set(['the','a','an','to','of','in','on','at','is','am','are','i','my','me','and','with','for','it','that','this','was','be','so','over'])

export function tokenize(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
}

// Local, deterministic embedding: hashed bag-of-words + char-trigram
// smoothing -> normalized vector. Never calls the network.
export function embed(text = '') {
  const vec = new Float32Array(EMBED_DIM)
  for (const t of tokenize(text)) {
    vec[hashToken(t) % EMBED_DIM] += 1
    for (let i = 0; i < t.length - 2; i += 1) {
      vec[hashToken(t.slice(i, i + 3)) % EMBED_DIM] += 0.3
    }
  }
  let norm = 0
  for (let i = 0; i < EMBED_DIM; i += 1) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm) || 1
  return Array.from(vec, (v) => v / norm)
}

export function cosine(a, b) {
  if (!a || !b || !a.length || !b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i]
  return dot
}

export function effectiveSalience(mem, at = now()) {
  const tau = TAU[mem.kind] || TAU.fact
  const ref = mem.last_reinforced != null ? mem.last_reinforced : (mem.created_at != null ? mem.created_at : at)
  const dt = Math.max(0, at - ref)
  const base = Number.isFinite(mem.salience) ? mem.salience : 0.5
  return clamp01(base * Math.exp(-dt / tau))
}

export function recencyScore(mem, at = now()) {
  const dt = Math.max(0, at - mem.created_at)
  return Math.exp(-dt / TAU_RECENCY)
}
