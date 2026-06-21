// useContinuity.js — wires the engine + brain + execution log to React state.
// React state holds ONLY ephemeral UI; durable memory lives in the engine /
// HydraDB (no localStorage / sessionStorage anywhere).

import { useCallback, useEffect, useRef, useState } from 'react'
import { ContinuityEngine } from '../lib/engine.js'
import { ExecutionLog } from '../lib/execution-log.js'
import { callBrain } from '../lib/brain.js'

const ago = (s) => Date.now() - s * 1000
const inDays = (d) => Date.now() + d * 86400000

// Believable starting memory so the Engine panel + proactive greeting work
// the instant the demo opens.
const SEED_MEMORIES = [
  { content: 'The user has an interview with Katie at Northwind on Tuesday.', kind: 'open_loop', salience: 0.9, entity: 'Katie', predicate: 'interview', due_hint: inDays(2) },
  { content: 'The user is waiting to hear back from Daniel about the apartment lease.', kind: 'open_loop', salience: 0.82, entity: 'Daniel', predicate: 'follow_up' },
  { content: 'The user prefers morning meetings over afternoons.', kind: 'preference', salience: 0.6, entity: null, predicate: 'meeting_time', last_reinforced: ago(40) },
  { content: 'The user takes their coffee black, no sugar.', kind: 'preference', salience: 0.5, entity: null, predicate: 'coffee' },
  { content: 'The user mentioned it was raining on the commute this morning.', kind: 'chatter', salience: 0.26, entity: null, predicate: null, created_at: ago(28), last_reinforced: ago(28) },
  { content: 'The user is allergic to penicillin.', kind: 'fact', salience: 0.95, entity: null, predicate: 'allergy' },
]

let mid = 0
const msg = (role, text, extra = {}) => ({ id: 'msg_' + (mid += 1), role, text, ...extra })

function readConfig() {
  const env = import.meta.env || {}
  const nebius = env.VITE_NEBIUS_API_KEY || ''
  const groq = env.VITE_GROQ_API_KEY || ''
  // Auto-pick the provider from whichever key is present (override with
  // VITE_BRAIN_PROVIDER). Nebius is the spec's primary; Groq the fallback.
  const provider = env.VITE_BRAIN_PROVIDER || (nebius ? 'nebius' : 'groq')
  return {
    apiKey: provider === 'nebius' ? (nebius || groq) : (groq || nebius),
    provider,
    hydra: {
      apiKey: env.VITE_HYDRA_API_KEY || '',
      tenantId: env.VITE_HYDRA_TENANT_ID || 'default-tenant',
      subTenantId: env.VITE_HYDRA_SUB_TENANT_ID || 'demo-user',
    },
  }
}

export function useContinuity() {
  const cfgRef = useRef(null)
  if (!cfgRef.current) cfgRef.current = readConfig()
  const config = cfgRef.current

  const logRef = useRef(null)
  if (!logRef.current) logRef.current = new ExecutionLog()

  const engineRef = useRef(null)
  if (!engineRef.current) {
    engineRef.current = new ContinuityEngine({ config, log: logRef.current })
    engineRef.current.seedLocal(SEED_MEMORIES)
  }
  const engine = engineRef.current

  const [messages, setMessages] = useState(() => [
    msg('agent', "I'm Continuity. I remember what matters and let the rest fade, then close your open loops before you ask. Tell me what's going on, or hit New session to see what I'm still holding for you."),
  ])
  const [snapshot, setSnapshot] = useState(() => engine.snapshot())
  const [logs, setLogs] = useState(() => logRef.current.list())
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [pulse, setPulse] = useState(0)
  const [highlight, setHighlight] = useState({ ids: [] })
  const [focusId, setFocusId] = useState(null)
  const [boot, setBoot] = useState(null)
  const [graph, setGraph] = useState({ nodes: [], edges: [] })

  const brainMode = config.apiKey ? 'live' : 'local'

  useEffect(() => logRef.current.subscribe(setLogs), [])

  // Decay heartbeat — drives the visibly-breathing salience bars.
  useEffect(() => {
    const t = setInterval(() => setSnapshot(engine.tick()), 1000)
    return () => clearInterval(t)
  }, [engine])

  const showToast = useCallback((text) => {
    const id = String(performance.now())
    setToast({ text, id })
    setTimeout(() => setToast((cur) => (cur && cur.id === id ? null : cur)), 2600)
  }, [])

  // Restore memory from HydraDB on startup — proves autonomous recall across
  // sessions (the "no amnesia when the tab closes" requirement).
  useEffect(() => {
    let alive = true
    engine.bootstrapFromHydra().then((r) => {
      if (!alive) return
      setBoot(r || null)
      setSnapshot(engine.snapshot())
      if (r && r.mode === 'restored') showToast('↺ ' + r.count + ' memories restored from HydraDB')
    }).catch(() => {})
    engine.loadGraph().then((g) => {
      if (!alive) return
      if (g && g.nodes && g.nodes.length) { setGraph(g); return }
      // HydraDB graph_context was sparse; reflect the client memory-graph so the log count matches the viz.
      const ents = [...new Set(engine.snapshot().memories.filter((m) => m.status === 'active' && m.entity).map((m) => m.entity))]
      logRef.current.event({ op: 'graph', store: 'local', status: 'ok', detail: 'graph · ' + (ents.length + 1) + ' entities · ' + ents.length + ' relations (memory-derived)' })
    }).catch(() => {})
    return () => { alive = false }
  }, [engine, showToast])

  const send = useCallback(async (text) => {
    const clean = text.trim()
    if (!clean || busy) return
    setMessages((m) => [...m, msg('user', clean)])
    setBusy(true)
    try {
      const res = await engine.ingest(clean, (mems, t) => callBrain(mems, t, config))
      setMessages((m) => [...m, msg('agent', res.reply, { action: res.action })])
      if (res.captured.length) setPulse((p) => p + 1)
      if (res.retrieved.length) {
        const ids = res.retrieved.map((r) => r.mem.id)
        setHighlight({ ids })
        setTimeout(() => setHighlight({ ids: [] }), 2600)
      }
      if (res.supersededIds.length) showToast('Memory updated — old version superseded')
      setSnapshot(engine.snapshot())
    } catch (err) {
      console.error(err)
      setMessages((m) => [...m, msg('agent', 'Something hiccuped, but your memory is safe. Try that again.')])
    } finally {
      setBusy(false)
    }
  }, [busy, config, engine, showToast])

  const newSession = useCallback(() => {
    const { greeting, focus } = engine.newSession()
    setMessages([msg('agent', greeting, { proactive: true })])
    setFocusId(focus ? focus.id : null)
    setHighlight({ ids: focus ? [focus.id] : [] })
    setTimeout(() => setHighlight({ ids: [] }), 3000)
    setSnapshot(engine.snapshot())
    showToast('New session — memory carried over')
  }, [engine, showToast])

  const sendAction = useCallback((actionId) => {
    const action = engine.sendAction(actionId)
    if (!action) return
    setMessages((m) => m.map((x) => (x.action && x.action.id === actionId ? { ...x, action: { ...x.action, status: 'sent' } } : x)))
    setSnapshot(engine.snapshot())
    showToast('Sent — open loop closed')
  }, [engine, showToast])

  return {
    messages, snapshot, logs, busy, toast, pulse, highlight, focusId, boot, graph,
    brainMode, send, newSession, sendAction,
  }
}
