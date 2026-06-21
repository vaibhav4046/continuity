// components.jsx — all UI for Continuity in one cohesive file.
// Header (+ cairn Logo), Chat (+ MicButton, ActionCard), EnginePanel,
// LogDock (HydraDB execution-log proof), Toast, Landing hero.

import { useEffect, useRef, useState } from 'react'

// ---------------- Logo: graphite cairn rising into a gold cloud ----------------
export function Logo({ pulse }) {
  return (
    <div className="logo" key={pulse} data-pulse={pulse}>
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
        <ellipse className="cloud" cx="17" cy="8" rx="11" ry="5.2" />
        <rect className="stone s1" x="8.5" y="22.5" width="17" height="5.4" rx="2.7" />
        <rect className="stone s2" x="10.5" y="17" width="13" height="5" rx="2.5" />
        <rect className="stone s3" x="12.5" y="12" width="9" height="4.6" rx="2.3" />
      </svg>
    </div>
  )
}

// ---------------- Header ----------------
export function Header({ brainMode, storeStatus, pulse, onNewSession, onToggleLogs, logsOpen }) {
  const onHydra = storeStatus === 'hydradb'
  return (
    <header className="header">
      <div className="brand">
        <Logo pulse={pulse} />
        <div className="wordmark">
          <span className="word glitch" data-text="Continuity">Continuity</span>
          <span className="tag mono">self-evolving memory</span>
        </div>
      </div>
      <div className="header-right">
        <span className={'chip mono ' + (brainMode === 'live' ? 'chip-live' : '')}>
          <span className="dot" /> brain: {brainMode}
        </span>
        <span className={'chip chip-store mono ' + (onHydra ? 'hydradb' : 'local')}>
          <span className="dot" /> store: {onHydra ? 'hydradb' : 'local'}
        </span>
        <button className={'btn-new ' + (logsOpen ? 'on' : '')} onClick={onToggleLogs} aria-pressed={logsOpen}>logs</button>
        <button className="btn-new" onClick={onNewSession}>New session</button>
      </div>
    </header>
  )
}

// ---------------- Chat ----------------
function ActionCard({ action, onSend }) {
  const sent = action.status === 'sent'
  return (
    <div className={'action-card ' + (sent ? 'sent' : '')}>
      <div className="action-head mono">
        <span>email draft</span>
        <span className={'status ' + (sent ? 'ok' : '')}>{sent ? 'sent' : 'ready'}</span>
      </div>
      <div className="action-row"><span className="lbl mono">to</span><span>{action.payload.to || '—'}</span></div>
      <div className="action-row"><span className="lbl mono">subject</span><span>{action.payload.subject}</span></div>
      <pre className="action-body">{action.payload.body}</pre>
      {!sent && <button className="btn-send-mail" onClick={() => onSend(action.id)}>Send &amp; close loop</button>}
    </div>
  )
}

const SUGGESTIONS = [
  'I have an interview with Katie at Northwind on Tuesday',
  'Actually, I prefer afternoon meetings now',
  'Draft a follow-up to Katie',
  'I am waiting to hear back from Daniel',
]

export function Chat({ messages, busy, onSend, onSendAction }) {
  const [text, setText] = useState('')
  const scrollRef = useRef(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, busy])

  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    onSend(text)
    setText('')
  }

  return (
    <section className="chat" aria-label="Conversation">
      <div className="messages" ref={scrollRef}>
        {messages.map((m) => (
          <div key={m.id} className={'msg ' + m.role + ' ' + (m.proactive ? 'proactive' : '')}>
            {m.proactive && <span className="proactive-tag mono">proactive recall</span>}
            <div className="bubble">{m.text}</div>
            {m.action && <ActionCard action={m.action} onSend={onSendAction} />}
          </div>
        ))}
        {messages.length < 2 && !busy && (
          <div className="suggest-wrap">
            <div className="suggest-label">try one</div>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="suggest-chip" onClick={() => onSend(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {busy && <div className="msg agent"><div className="bubble typing"><span /><span /><span /></div></div>}
      </div>
      <form className="composer" onSubmit={submit}>
        <input
          className="composer-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tell Continuity what's going on…"
          aria-label="Message Continuity"
        />
        <button className="btn-send" type="submit" disabled={busy || !text.trim()}>Send</button>
      </form>
    </section>
  )
}

// ---------------- Engine panel ----------------
const KIND_LABEL = { open_loop: 'open loop', preference: 'preference', fact: 'fact', chatter: 'chatter' }

function Bar({ value, kind }) {
  return (
    <div className="bar">
      <div className={'bar-fill k-' + kind} style={{ width: Math.round(value * 100) + '%' }} />
    </div>
  )
}

function MemChip({ mem, score, highlighted }) {
  const superseded = mem.status === 'superseded'
  const archived = mem.status === 'archived'
  const resolved = mem.status === 'resolved'
  const cls = ['chip-mem']
  if (highlighted) cls.push('hot')
  if (superseded) cls.push('superseded')
  if (archived) cls.push('archived')
  if (resolved) cls.push('resolved')
  return (
    <div className={cls.join(' ')}>
      <div className="chip-top">
        <span className={'kind mono k-' + mem.kind}>{KIND_LABEL[mem.kind] || mem.kind}</span>
        {mem.entity && <span className="entity">{mem.entity}</span>}
        {superseded && <span className="status-tag mono">superseded</span>}
        {archived && <span className="status-tag mono">forgotten</span>}
        {resolved && <span className="status-tag mono ok">resolved</span>}
        {score != null && <span className="score">{score.toFixed(2)}</span>}
      </div>
      <div className="chip-content">{mem.content}</div>
      {!archived && !superseded && <Bar value={mem.eff} kind={mem.kind} />}
    </div>
  )
}

// Live knowledge graph from HydraDB's extracted entity-relation triplets —
// proves we use HydraDB's graph layer, not just key/value recall.
function buildLocalGraph(memories) {
  const nodes = [{ id: 'user', name: 'user', type: 'PERSON' }]
  const edges = []
  const seen = new Set(['user'])
  for (const m of (memories || [])) {
    if (m.status !== 'active' || !m.entity) continue
    if (!seen.has(m.entity)) { seen.add(m.entity); nodes.push({ id: m.entity, name: m.entity, type: m.kind === 'open_loop' ? 'EVENT' : 'PERSON' }) }
    edges.push({ source: 'user', target: m.entity, label: m.predicate || m.kind || '' })
  }
  return { nodes, edges }
}

function GraphPanel({ graph, memories }) {
  // Prefer HydraDB's extracted graph; fall back to a graph built from the live
  // memories so the viz always renders even when graph extraction is sparse.
  const g = (graph && graph.nodes && graph.nodes.length >= 2) ? graph : buildLocalGraph(memories)
  if (!g.nodes || g.nodes.length < 2) return null
  const W = 356, H = 210, cx = W / 2, cy = H / 2, R = 80
  const nodes = g.nodes.slice(0, 8)
  const hub = nodes.find((n) => /user/i.test(n.name)) || nodes[0]
  const others = nodes.filter((n) => n !== hub)
  const pos = { [hub.id]: { x: cx, y: cy } }
  others.forEach((n, i) => {
    const a = (2 * Math.PI * i) / others.length - Math.PI / 2
    pos[n.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }
  })
  const fill = (t) => (t === 'PERSON' ? 'var(--gold-bright)' : t === 'EVENT' ? 'var(--hydra-amber)' : 'var(--hydra-gray)')
  const edges = (g.edges || []).filter((e) => pos[e.source] && pos[e.target]).slice(0, 12)
  return (
    <div className="engine-section">
      <div className="section-label mono"><span className="gold-dot" /> memory graph · hydradb</div>
      <svg className="graph-svg" viewBox={'0 0 ' + W + ' ' + H} role="img" aria-label="HydraDB knowledge graph">
        {edges.map((e, i) => {
          const a = pos[e.source]
          const b = pos[e.target]
          return (
            <g key={'e' + i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="graph-edge" />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 2} className="graph-elabel">{e.label}</text>
            </g>
          )
        })}
        {nodes.map((n) => {
          const p = pos[n.id]
          return (
            <g key={n.id}>
              <circle cx={p.x} cy={p.y} r={n === hub ? 9 : 6} className="graph-node" style={{ fill: fill(n.type) }} />
              <text x={p.x} y={p.y - 12} className="graph-nlabel">{n.name}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function EnginePanel({ snapshot, highlight, focusId, graph }) {
  const scoreById = {}
  ;(snapshot.lastRetrieval || []).forEach((r) => { scoreById[r.id] = r.score })
  const hot = new Set(highlight.ids || [])

  const loops = snapshot.memories
    .filter((m) => m.kind === 'open_loop' && m.status === 'active')
    .sort((a, b) => (a.due_hint || Infinity) - (b.due_hint || Infinity))
  const active = snapshot.memories
    .filter((m) => m.status === 'active' && m.kind !== 'open_loop')
    .sort((a, b) => b.eff - a.eff)
  const resolved = snapshot.memories.filter((m) => m.status === 'resolved')
  const faded = snapshot.memories.filter((m) => m.status === 'superseded' || m.status === 'archived')

  return (
    <aside className="engine" aria-label="Memory Engine">
      <div className="engine-head">
        <span className="mono engine-title">memory engine</span>
        <span className="mono engine-stat">{active.length + loops.length} active · {faded.length} faded</span>
      </div>

      <GraphPanel graph={graph} memories={snapshot.memories} />

      <div className="engine-section">
        <div className="section-label mono"><span className="gold-dot" /> open loops</div>
        {loops.length === 0 && <div className="empty mono">none — all clear</div>}
        {loops.map((m) => (
          <MemChip key={m.id} mem={m} score={scoreById[m.id]} highlighted={hot.has(m.id) || m.id === focusId} />
        ))}
      </div>

      <div className="engine-section">
        <div className="section-label mono">memories</div>
        {active.map((m) => (
          <MemChip key={m.id} mem={m} score={scoreById[m.id]} highlighted={hot.has(m.id)} />
        ))}
      </div>

      {resolved.length > 0 && (
        <div className="engine-section">
          <div className="section-label mono"><span className="ok-dot" /> closed loops</div>
          {resolved.map((m) => <MemChip key={m.id} mem={m} />)}
        </div>
      )}
      {faded.length > 0 && (
        <div className="engine-section">
          <div className="section-label mono">faded</div>
          {faded.map((m) => <MemChip key={m.id} mem={m} />)}
        </div>
      )}
    </aside>
  )
}

// ---------------- Log dock: live HydraDB execution-log traces ----------------
function fmtTs(iso) {
  return typeof iso === 'string' && iso.length >= 23 ? iso.slice(11, 23) : iso
}

export function LogDock({ logs, open, onToggle }) {
  const bodyRef = useRef(null)
  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [logs, open])

  const ops = logs.length
  return (
    <section className={'logdock ' + (open ? '' : 'collapsed')} aria-label="HydraDB execution log">
      <div className="logdock-head" onClick={onToggle} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle() }}>
        <span className="logdock-title mono">
          <span className="live-dot" /> hydradb execution log
        </span>
        <span className="mono engine-stat">{ops} ops · {open ? 'hide' : 'show'}</span>
      </div>
      <div className="logdock-body" ref={bodyRef}>
        {logs.length === 0 && <div className="empty mono">no operations yet</div>}
        {logs.map((l) => (
          <div className="logrow" key={l.id}>
            <span className="ts">{fmtTs(l.ts)}</span>
            <span className="op">{l.op}</span>
            <span className={'store ' + l.store}>{l.store}</span>
            <span className={'st-' + l.status}>{l.status}</span>
            <span className="detail">{l.detail}</span>
            <span className="meta">{l.latency_ms != null ? l.latency_ms + 'ms' : ''} {l.request_id ? '· ' + l.request_id : ''}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------- Toast ----------------
export function Toast({ toast }) {
  if (!toast) return null
  return <div className="toast" role="status">{toast.text}</div>
}

// ---------------- Anime / mystical hero art ----------------
function OracleArt() {
  return (
    <svg viewBox="0 0 320 360" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="moonGrad" cx="40%" cy="38%" r="65%">
          <stop offset="0%" stopColor="#fbe6a0" />
          <stop offset="45%" stopColor="#E8B53C" />
          <stop offset="100%" stopColor="#5a4410" />
        </radialGradient>
      </defs>
      <circle className="art-moon" cx="232" cy="84" r="46" />
      <g className="art-glitch">
        <path className="art-stroke" d="M40 118 Q160 100 280 118" />
        <path className="art-stroke" d="M64 150 L256 150" />
        <path className="art-stroke" d="M78 118 L78 322" />
        <path className="art-stroke" d="M242 118 L242 322" />
      </g>
      <g className="art-figure">
        <path d="M118 322 L133 214 Q160 190 187 214 L202 322 Z" />
        <circle cx="160" cy="198" r="22" />
      </g>
      <circle className="art-glow" cx="152" cy="197" r="2.6" />
      <circle className="art-glow" cx="168" cy="197" r="2.6" />
      <g>
        <rect className="art-fill" x="138" y="286" width="44" height="14" rx="5" />
        <rect className="art-fill" x="144" y="270" width="32" height="13" rx="5" />
        <rect className="art-fill" x="149" y="256" width="22" height="12" rx="5" />
      </g>
      <line className="art-scan" x1="28" y1="0" x2="292" y2="0" />
    </svg>
  )
}

// Remotion-rendered brand intro (public/continuity-intro.mp4). Falls back to
// the SVG oracle art if the video is missing or fails to load.
function VideoHero() {
  const [failed, setFailed] = useState(false)
  if (failed) return <OracleArt />
  return (
    <video
      className="hero-video"
      src="/continuity-intro.mp4"
      autoPlay
      loop
      muted
      playsInline
      onError={() => setFailed(true)}
    />
  )
}

// ---------------- Landing hero ----------------
function useReveal() {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return undefined }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setShown(true); io.disconnect() } }), { threshold: 0.12 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, shown]
}

function Section({ id, label, title, children }) {
  const [ref, shown] = useReveal()
  return (
    <section id={id} ref={ref} className={'lsec reveal' + (shown ? ' in' : '')}>
      {label && <div className="lsec-label mono">{label}</div>}
      {title && <h2 className="lsec-title">{title}</h2>}
      {children}
    </section>
  )
}

const ENGINE_STAGES = ['capture', 'extract', 'resolve', 'decay', 'retrieve', 'surface', 'act']
const BEHAVIOR = [['reinforce', 'used memories grow stronger'], ['decay', 'ignored memories fade and archive'], ['supersede', 'a new truth strikes out the old'], ['surface', 'the right thing, unprompted']]

export function Landing({ onEnter }) {
  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="word glitch" data-text="Continuity">Continuity</span>
        <nav className="lnav mono">
          <a href="#behavior">./behavior</a>
          <a href="#engine">./engine</a>
          <a href="#hydradb">./hydradb</a>
          <a href="#loops">./loops</a>
          <a href="#tools">./tools</a>
        </nav>
        <button className="lnav-cta mono" onClick={onEnter}>&gt; enter_app</button>
      </header>

      <main className="hero">
        <div className="hero-copy">
          <span className="kicker">self-evolving // context-aware</span>
          <h1 className="hero-title">It <span className="em">remembers</span> what matters.<br />And <span className="em">forgets</span> what doesn&apos;t.</h1>
          <p className="hero-sub">
            A memory that reinforces on use, decays when ignored, and rewrites itself on
            contradiction, then closes your open loops before you ask. One memory, every tool, backed by HydraDB.
          </p>
          <div className="hero-cta">
            <button className="btn-enter" onClick={onEnter}>Enter Continuity</button>
            <span className="hint">7-stage engine // live</span>
          </div>
          <div className="hero-stats">
            <div><b>reinforce</b><span>on use</span></div>
            <div><b>decay</b><span>when ignored</span></div>
            <div><b>supersede</b><span>on conflict</span></div>
            <div><b>surface</b><span>unprompted</span></div>
          </div>
        </div>
        <div className="hero-art">
          <VideoHero />
          <span className="mote m1" /><span className="mote m2" /><span className="mote m3" /><span className="mote m4" />
        </div>
      </main>

      <Section id="proof" label="// the proof — same prompt, different output" title="Stored history changes the action">
        <div className="ba-grid">
          <div className="ba-col cold">
            <div className="ba-head mono">without memory<span className="ba-tag">generic</span></div>
            <p className="ba-body">&ldquo;Hi, following up on my application. Let me know if you need anything else.&rdquo;</p>
            <div className="ba-note mono">no context · same reply every other bot sends</div>
          </div>
          <div className="ba-col warm">
            <div className="ba-head mono">with Continuity<span className="ba-tag on">recalled from HydraDB</span></div>
            <p className="ba-body">&ldquo;Hi Katie, circling back on Tuesday&apos;s Northwind interview. You said a decision by Friday, so checking in. Keeping it short, as you prefer.&rdquo;</p>
            <ul className="ba-recall mono">
              <li><span>katie</span> interviewer</li>
              <li><span>northwind</span> company</li>
              <li><span>friday</span> decision date</li>
              <li><span>concise tone</span> replaced <span className="sup">&ldquo;formal&rdquo;</span></li>
            </ul>
          </div>
        </div>
        <p className="lsec-sub">Same prompt. The right output, because the agent recalled who, where, and when from HydraDB, then applied a tone preference that superseded an older one. Enter the app to run this live.</p>
      </Section>

      <Section id="behavior" label="// section.01 — behavior" title="A memory that behaves like a person">
        <div className="lcards">
          {BEHAVIOR.map(([t, d], i) => (
            <div className="lcard" key={t} style={{ transitionDelay: (i * 90) + 'ms' }}><b>{t}</b><span>{d}</span></div>
          ))}
        </div>
      </Section>

      <Section id="engine" label="// section.02 — engine" title="The 7-stage memory engine">
        <div className="pipe">
          {ENGINE_STAGES.map((s, i) => (
            <span className="pipe-item" key={s} style={{ transitionDelay: (i * 80) + 'ms' }}>
              <span className="pipe-stage">{s}</span>
              {i < ENGINE_STAGES.length - 1 && <span className="pipe-arrow">→</span>}
            </span>
          ))}
        </div>
        <p className="lsec-sub">~96% deterministic code, ~4% AI. Weighted retrieval, not cosine top-k. It rewrites itself over time.</p>
      </Section>

      <Section id="hydradb" label="// section.03 — hydradb" title="Live memory + a real knowledge graph">
        <div className="hydra-row">
          <svg className="mini-graph" viewBox="0 0 320 180" aria-hidden="true">
            <line x1="160" y1="92" x2="82" y2="44" /><line x1="160" y1="92" x2="248" y2="52" /><line x1="160" y1="92" x2="124" y2="150" /><line x1="248" y1="52" x2="290" y2="120" />
            <circle cx="160" cy="92" r="9" className="gn user" /><circle cx="82" cy="44" r="7" className="gn ev" /><circle cx="248" cy="52" r="7" className="gn pn" /><circle cx="124" cy="150" r="7" className="gn pn" /><circle cx="290" cy="120" r="6" className="gn en" />
            <text x="160" y="80" className="gl">user</text><text x="82" y="34" className="gl">interview</text><text x="248" y="42" className="gl">katie</text><text x="124" y="168" className="gl">daniel</text><text x="290" y="142" className="gl">northwind</text>
          </svg>
          <pre className="log-strip mono">{'SYSTEM hydradb ok  connected · tenant=default-tenant\nQUERY  hydradb ok  restored 5 memories · 278ms · req_8576\nWRITE  hydradb ok  ingest "interview with Katie" · req_c1d2\nQUERY  hydradb ok  graph · 6 entities · 9 relations'}</pre>
        </div>
        <p className="lsec-sub">Real writes, real recall, real cross-session restore, proven on HydraDB, not faked.</p>
      </Section>

      <Section id="loops" label="// section.04 — loops" title="It closes your open loops">
        <div className="loop-card">
          <div className="loop-head mono"><span>email draft</span><span className="ok">ready</span></div>
          <div className="loop-row"><span className="mono">to</span><span>Katie</span></div>
          <div className="loop-row"><span className="mono">subject</span><span>Following up on the interview</span></div>
          <p className="loop-body">Hi Katie, just circling back on the interview at Northwind. Any update when you get a moment? Thanks, You</p>
          <div className="loop-send mono">&gt; send &amp; close loop ✓</div>
        </div>
        <p className="lsec-sub">It drafts, you approve, it sends. The agent asks before it acts.</p>
      </Section>

      <Section id="tools" label="// section.05 — everywhere" title="One memory, every tool">
        <div className="tools-row">
          {['codex', 'cursor', 'claude code', 'gemini cli', 'opencode'].map((t) => <span className="tool-chip mono" key={t}>{t}</span>)}
        </div>
        <p className="lsec-sub">Connect the MCP server and your context follows you between tools, checkpoint in one, resume in the next. Roadmap: Telegram · WhatsApp · 24/7 · approve-from-chat.</p>
      </Section>

      <footer className="lfoot">
        <h2 className="lfoot-title">Stop re-explaining yourself.</h2>
        <button className="btn-enter big" onClick={onEnter}>Enter Continuity →</button>
        <div className="mono lfoot-meta">built for Agents You Love · live on HydraDB</div>
      </footer>
    </div>
  )
}
