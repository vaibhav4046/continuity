import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { loadFont as loadPixel } from '@remotion/google-fonts/PressStart2P'
import { loadFont as loadTerm } from '@remotion/google-fonts/VT323'

const { fontFamily: PIXEL } = loadPixel()
const { fontFamily: TERM } = loadTerm()

const GOLD = '#D9A93A'
const GOLDB = '#F5CD5C'
const AMBER = '#F9C425'
const BG = '#050506'
const TEXT = '#ECE6D6'
const MUTED = '#8E8E94'
const FAINT = '#5c543f'
const OK = '#8FE39A'
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }

// The whole product as a typed CLI session (frames @ 30fps).
const LINES = [
  { at: 8, t: 'sys', x: 'continuity.svc — memory online · ctx://hydradb' },
  { at: 26, t: 'cmd', x: 'remember: interview with Katie at Northwind, Tuesday' },
  { at: 52, t: 'add', x: '+ stored  [open_loop · Katie]  salience 0.90' },
  { at: 78, t: 'cmd', x: 'actually — I prefer afternoon meetings now' },
  { at: 104, t: 'amb', x: '~ superseded  "morning meetings" -> "afternoon meetings"' },
  { at: 140, t: 'sys', x: '… 45s idle …' },
  { at: 154, t: 'gone', x: '- forgot  "raining on the commute"  (trivia decayed)' },
  { at: 184, t: 'sys', x: 'new session' },
  { at: 194, t: 'out', x: 'Continuity: did you hear back from Katie? draft a follow-up?' },
  { at: 224, t: 'cmd', x: 'yes, draft it' },
  { at: 244, t: 'ok', x: 'drafted -> Katie · "Following up on the interview"' },
  { at: 270, t: 'cmd', x: 'send' },
  { at: 286, t: 'ok', x: 'sent · open loop closed' },
  { at: 306, t: 'sys', x: '— tab closed · reopen · switch to cursor —' },
  { at: 320, t: 'rst', x: '5 memories restored from HydraDB · req_85766284' },
]

const PRE = { cmd: '> ', add: '  ', amb: '  ', gone: '  ', out: '  ', ok: '  ', sys: '// ', rst: '  ' }
const COL = { cmd: GOLDB, add: GOLD, amb: AMBER, gone: FAINT, out: TEXT, ok: OK, sys: MUTED, rst: GOLDB }

function Scanlines() {
  const f = useCurrentFrame()
  return (
    <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.14) 3px, rgba(0,0,0,0) 4px)', backgroundPositionY: ((f * 2) % 6) + 'px', opacity: 0.5, pointerEvents: 'none' }} />
  )
}

// Gold stickman that "uses" the app — pose driven by the current frame.
function Stick() {
  const f = useCurrentFrame()
  let pose = 'idle'
  if (f >= 24 && f < 130) pose = 'type'
  else if (f >= 184 && f < 224) pose = 'nod'
  else if (f >= 224 && f < 300) pose = 'thumbs'
  else if (f >= 300 && f < 340) pose = 'walk'
  const bob = Math.sin(f / 5) * (pose === 'type' ? 2 : 1)
  const nod = pose === 'nod' ? Math.sin(f / 4) * 7 : 0
  const walkX = pose === 'walk' ? interpolate(f, [300, 340], [0, 120], clamp) : 0
  const legSwing = pose === 'walk' ? Math.sin(f / 3) * 14 : 0
  const typeWig = pose === 'type' ? Math.sin(f / 2) * 5 : 0
  const armR = pose === 'thumbs' ? { x: 26, y: -56 } : pose === 'type' ? { x: 20 + typeWig, y: -8 } : { x: 22, y: -6 }
  const armL = pose === 'type' ? { x: -20 - typeWig, y: -8 } : { x: -20, y: -6 }
  return (
    <svg viewBox="-70 -110 140 170" style={{ position: 'absolute', right: 120, top: '50%', width: 360, height: 440, transform: 'translate(' + walkX + 'px, -50%)', filter: 'drop-shadow(0 0 8px rgba(217,169,58,0.5))' }} aria-hidden="true">
      {(pose === 'type' || pose === 'thumbs' || pose === 'nod') && <line x1="-50" y1="22" x2="50" y2="22" stroke={GOLD} strokeWidth="2.5" opacity="0.5" />}
      <g transform={'translate(0,' + bob + ')'} stroke={GOLD} strokeWidth="3" strokeLinecap="round" fill="none">
        <circle cx={0} cy={-58 + nod} r="13" stroke={GOLDB} />
        <circle cx={-4} cy={-60 + nod} r="1.6" fill={GOLDB} stroke="none" />
        <circle cx={4} cy={-60 + nod} r="1.6" fill={GOLDB} stroke="none" />
        <line x1="0" y1={-44 + nod} x2="0" y2="12" />
        <line x1="0" y1="-30" x2={armL.x} y2={-30 + armL.y} />
        <line x1="0" y1="-30" x2={armR.x} y2={-30 + armR.y} />
        {pose === 'thumbs' && <circle cx={armR.x} cy={-30 + armR.y - 4} r="4" fill={GOLDB} stroke="none" />}
        <line x1="0" y1="12" x2={-14 - legSwing} y2="46" />
        <line x1="0" y1="12" x2={14 + legSwing} y2="46" />
      </g>
    </svg>
  )
}

// memory chips in the right rail
function Chips() {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const chips = [
    { at: 40, kind: 'preference', text: 'prefers morning meetings', supersede: 104 },
    { at: 52, kind: 'open_loop', label: 'Katie', text: 'interview · Northwind · Tue', resolve: 286 },
    { at: 40, kind: 'chatter', text: 'raining on the commute', fade: 154 },
    { at: 110, kind: 'preference', text: 'prefers afternoon meetings' },
  ]
  return (
    <div style={{ position: 'absolute', right: 70, top: 150, width: 470, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {chips.map((c, i) => {
        if (f < c.at) return null
        const s = spring({ frame: f - c.at, fps, config: { damping: 16 } })
        const strike = c.supersede != null && f > c.supersede
        const resolved = c.resolve != null && f > c.resolve
        let op = s
        if (c.fade != null) op = s * interpolate(f, [c.fade, c.fade + 26], [1, 0.12], clamp)
        if (strike) op = s * 0.5
        const isLoop = c.kind === 'open_loop'
        const border = resolved ? OK : isLoop ? GOLD : '#2a2417'
        return (
          <div key={i} style={{ opacity: op, transform: 'translateX(' + interpolate(s, [0, 1], [60, 0]) + 'px)', border: '1px solid ' + border, background: 'rgba(14,14,18,0.9)', borderRadius: 6, padding: '12px 14px', boxShadow: resolved ? '0 0 18px rgba(143,227,154,0.25)' : 'none' }}>
            <div style={{ fontFamily: TERM, fontSize: 22, color: isLoop ? GOLDB : MUTED, textTransform: 'uppercase', letterSpacing: 2 }}>
              {c.kind}{c.label ? '  ' : ''}<span style={{ color: TEXT }}>{c.label || ''}</span>
              {strike ? '  superseded' : ''}{resolved ? '  resolved' : ''}{c.fade != null && f > c.fade + 6 ? '  forgotten' : ''}
            </div>
            <div style={{ fontFamily: TERM, fontSize: 28, color: TEXT, textDecoration: strike ? 'line-through' : 'none', marginTop: 4 }}>{c.text}</div>
          </div>
        )
      })}
    </div>
  )
}

function Terminal() {
  const f = useCurrentFrame()
  const visibleLines = LINES.filter((l) => f >= l.at)
  const MAXVIS = 11
  const shift = Math.max(0, visibleLines.length - MAXVIS) * 38
  return (
    <div style={{ position: 'absolute', left: 70, top: 132, width: 980, height: 760, overflow: 'hidden', fontFamily: TERM, fontSize: 30, lineHeight: '38px' }}>
      <div style={{ transform: 'translateY(' + -shift + 'px)' }}>
        {visibleLines.map((l, i) => {
          const n = Math.max(0, Math.floor((f - l.at) * 2.4))
          const shown = l.x.slice(0, n)
          const typing = n < l.x.length
          return (
            <div key={i} style={{ color: COL[l.t], whiteSpace: 'pre' }}>
              <span style={{ color: l.t === 'cmd' ? GOLD : COL[l.t] }}>{PRE[l.t]}</span>{shown}
              {typing && <span style={{ background: GOLD, color: BG }}>{(f % 16 < 8) ? ' ' : ''}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Tagline() {
  const f = useCurrentFrame()
  const a = interpolate(f, [328, 342], [0, 1], clamp)
  if (a <= 0) return null
  return (
    <AbsoluteFill style={{ background: 'rgba(5,5,6,0.82)', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', opacity: a }}>
      <div style={{ fontFamily: PIXEL, fontSize: 26, color: GOLD, textShadow: '0 0 16px rgba(217,169,58,0.5)' }}>CONTINUITY</div>
      <div style={{ fontFamily: TERM, fontSize: 52, color: TEXT, marginTop: 26 }}>It remembers what matters.</div>
      <div style={{ fontFamily: TERM, fontSize: 52, color: GOLD, textShadow: '0 0 24px rgba(217,169,58,0.5)' }}>And forgets what doesn&apos;t.</div>
      <div style={{ fontFamily: TERM, fontSize: 30, color: MUTED, marginTop: 22, letterSpacing: 3 }}>one memory · every tool · backed by HydraDB</div>
    </AbsoluteFill>
  )
}

export const Explainer = () => {
  const f = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const intro = interpolate(f, [0, 12], [0, 1], clamp)
  const fade = interpolate(f, [durationInFrames - 10, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' })
  return (
    <AbsoluteFill style={{ backgroundColor: BG, opacity: fade }}>
      <AbsoluteFill style={{ background: 'radial-gradient(60% 50% at 82% 6%, rgba(217,169,58,0.12), transparent 60%), radial-gradient(120% 120% at 50% 50%, transparent 55%, rgba(0,0,0,0.6) 100%)' }} />
      <div style={{ position: 'absolute', inset: 48, border: '1px solid ' + GOLD, borderRadius: 10, opacity: intro, boxShadow: 'inset 0 0 60px rgba(217,169,58,0.05)' }} />
      <div style={{ position: 'absolute', left: 48, right: 48, top: 48, height: 56, borderBottom: '1px solid ' + GOLD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', opacity: intro }}>
        <span style={{ fontFamily: TERM, fontSize: 30, color: GOLD, letterSpacing: 1 }}>continuity.svc — live</span>
        <span style={{ fontFamily: TERM, fontSize: 26, color: MUTED }}>ctx://hydradb · 0xc0ffee</span>
      </div>
      <Terminal />
      <Chips />
      <Stick />
      <Scanlines />
      <Tagline />
    </AbsoluteFill>
  )
}
