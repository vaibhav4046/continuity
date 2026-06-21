import React from 'react'
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { loadFont as loadPixel } from '@remotion/google-fonts/PressStart2P'
import { loadFont as loadTerm } from '@remotion/google-fonts/VT323'

const { fontFamily: PIXEL } = loadPixel()
const { fontFamily: TERM } = loadTerm()

const GOLD = '#D9A93A'
const GOLD_BRIGHT = '#F5CD5C'
const BG = '#050506'
const TEXT = '#ECE6D6'
const MUTED = '#9a9078'
const clampOpts = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }

function Background() {
  const frame = useCurrentFrame()
  const scan = (frame * 2) % 6
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <AbsoluteFill style={{ background: 'radial-gradient(55% 45% at 80% 4%, rgba(217,169,58,0.16), transparent 60%), radial-gradient(120% 120% at 50% 50%, transparent 52%, rgba(0,0,0,0.65) 100%)' }} />
      <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.16) 3px, rgba(0,0,0,0) 4px)', backgroundPositionY: scan + 'px', opacity: 0.5 }} />
    </AbsoluteFill>
  )
}

function Glitch({ text, size, color, font }) {
  const frame = useCurrentFrame()
  const burst = frame % 34 < 3
  const dx = burst ? 5 : 0
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {burst && <div style={{ position: 'absolute', left: dx, top: 1, fontFamily: font, fontSize: size, color: 'rgba(255,46,99,0.75)', whiteSpace: 'nowrap' }}>{text}</div>}
      {burst && <div style={{ position: 'absolute', left: -dx, top: -1, fontFamily: font, fontSize: size, color: 'rgba(37,208,224,0.75)', whiteSpace: 'nowrap' }}>{text}</div>}
      <div style={{ position: 'relative', fontFamily: font, fontSize: size, color, letterSpacing: 2, textShadow: '0 0 22px rgba(217,169,58,0.5)', whiteSpace: 'nowrap' }}>{text}</div>
    </div>
  )
}

function SceneIntro() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const stoneStyle = (i) => {
    const s = spring({ frame: frame - i * 6, fps, config: { damping: 14 } })
    return { transform: 'translateY(' + interpolate(s, [0, 1], [50, 0]) + 'px) scale(' + s + ')', opacity: s }
  }
  const cloud = spring({ frame: frame - 22, fps, config: { damping: 18 } })
  const wm = interpolate(frame, [30, 44], [0, 1], clampOpts)
  const sub = interpolate(frame, [46, 58], [0, 1], clampOpts)
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
      <div style={{ position: 'relative', width: 240, height: 200, marginBottom: 26 }}>
        <div style={{ position: 'absolute', top: 0, left: 50, width: 140, height: 64, borderRadius: '50%', background: 'radial-gradient(circle at 40% 38%, ' + GOLD_BRIGHT + ', ' + GOLD + ' 60%, rgba(217,169,58,0.08))', filter: 'blur(3px)', opacity: cloud * 0.95, transform: 'scale(' + (0.7 + cloud * 0.3) + ')' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 45, width: 150, height: 38, borderRadius: 14, background: '#46443a', border: '2px solid ' + GOLD, boxShadow: '0 0 16px rgba(217,169,58,0.3)', ...stoneStyle(0) }} />
        <div style={{ position: 'absolute', bottom: 44, left: 60, width: 120, height: 34, borderRadius: 13, background: '#3a382f', border: '2px solid ' + GOLD, ...stoneStyle(1) }} />
        <div style={{ position: 'absolute', bottom: 84, left: 75, width: 90, height: 30, borderRadius: 12, background: '#33312a', border: '2px solid ' + GOLD, ...stoneStyle(2) }} />
      </div>
      <div style={{ opacity: wm }}><Glitch text="CONTINUITY" size={72} color={GOLD} font={PIXEL} /></div>
      <div style={{ fontFamily: TERM, fontSize: 34, color: GOLD, letterSpacing: 8, marginTop: 22, opacity: sub }}>SELF-EVOLVING MEMORY</div>
    </AbsoluteFill>
  )
}

function Chip({ kind, label, text, sal, start, decay, supersede }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - start, fps, config: { damping: 16 } })
  const x = interpolate(s, [0, 1], [140, 0])
  let opacity = s
  let barW = sal
  if (decay != null) {
    const d = interpolate(frame, [decay, decay + 28], [1, 0.12], clampOpts)
    opacity = s * d
    barW = sal * d
  }
  const strike = supersede != null && frame > supersede
  const isLoop = kind === 'open loop'
  return (
    <div style={{ width: 620, transform: 'translateX(' + x + 'px)', opacity, border: '1px solid ' + (isLoop ? GOLD : '#2a2417'), background: 'rgba(14,14,18,0.88)', borderRadius: 8, padding: '16px 18px', marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 9 }}>
        <span style={{ fontFamily: TERM, fontSize: 24, color: isLoop ? GOLD_BRIGHT : MUTED, textTransform: 'uppercase', letterSpacing: 2 }}>{kind}</span>
        {label && <span style={{ fontFamily: TERM, fontSize: 24, color: TEXT, background: 'rgba(217,169,58,0.12)', padding: '0 9px', borderRadius: 4 }}>{label}</span>}
        {decay != null && frame > decay + 8 && <span style={{ fontFamily: TERM, fontSize: 22, color: MUTED }}>forgotten</span>}
        {strike && <span style={{ fontFamily: TERM, fontSize: 22, color: MUTED }}>superseded</span>}
      </div>
      <div style={{ fontFamily: TERM, fontSize: 30, color: TEXT, textDecoration: strike ? 'line-through' : 'none' }}>{text}</div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, marginTop: 14 }}>
        <div style={{ height: '100%', width: Math.max(0, barW * 100) + '%', background: 'linear-gradient(90deg, ' + GOLD + ', ' + GOLD_BRIGHT + ')', borderRadius: 3, boxShadow: '0 0 10px ' + GOLD }} />
      </div>
    </div>
  )
}

function SceneChips() {
  const frame = useCurrentFrame()
  const head = interpolate(frame, [0, 12], [0, 1], clampOpts)
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
      <div style={{ fontFamily: PIXEL, fontSize: 22, color: GOLD, letterSpacing: 2, marginBottom: 30, opacity: head }}>THE MEMORY ENGINE</div>
      <Chip kind="open loop" label="Katie" text="Interview with Katie at Northwind, Tuesday" sal={0.9} start={6} />
      <Chip kind="preference" text="Prefers morning meetings over afternoons" sal={0.6} start={16} supersede={54} />
      <Chip kind="chatter" text="It was raining on the commute this morning" sal={0.45} start={26} decay={46} />
      <Chip kind="preference" text="Actually — prefers afternoon meetings now" sal={0.66} start={56} />
    </AbsoluteFill>
  )
}

function SceneTagline() {
  const frame = useCurrentFrame()
  const a = interpolate(frame, [2, 16], [0, 1], clampOpts)
  const b = interpolate(frame, [18, 32], [0, 1], clampOpts)
  const c = interpolate(frame, [36, 50], [0, 1], clampOpts)
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column', padding: 90 }}>
      <div style={{ fontFamily: TERM, fontSize: 72, color: TEXT, opacity: a, textAlign: 'center' }}>It remembers what matters.</div>
      <div style={{ fontFamily: TERM, fontSize: 72, color: GOLD, opacity: b, textShadow: '0 0 30px rgba(217,169,58,0.5)', textAlign: 'center' }}>And forgets what doesn&apos;t.</div>
      <div style={{ fontFamily: TERM, fontSize: 32, color: MUTED, marginTop: 26, opacity: c, letterSpacing: 2, textAlign: 'center' }}>context that survives the tab close — backed by HydraDB</div>
    </AbsoluteFill>
  )
}

export const Intro = () => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const fade = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' })
  return (
    <AbsoluteFill style={{ opacity: fade, backgroundColor: BG }}>
      <Background />
      <Sequence durationInFrames={72}><SceneIntro /></Sequence>
      <Sequence from={62} durationInFrames={86}><SceneChips /></Sequence>
      <Sequence from={140} durationInFrames={70}><SceneTagline /></Sequence>
    </AbsoluteFill>
  )
}
