#!/usr/bin/env node
// Continuity 24/7 autonomous agent — a scheduled worker over the LIVE HydraDB
// memory. It reasons over your open loops and autonomously DRAFTS follow-ups;
// it only SENDS when you configure SMTP and opt in (--yes). Runs locally, via
// cron, pm2, or a cloud box. Shares the same HydraDB tenant as the web app, so
// everything it does shows up there too.
//
//   node agent/agent.mjs ingest "<text | @file>"  # import context (ChatGPT/Claude export, notes, anything)
//   node agent/agent.mjs scan                       # one pass: draft follow-ups for stale open loops
//   node agent/agent.mjs watch [minutes]            # 24/7 loop (default every 30 min)
//   node agent/agent.mjs send --yes                 # actually send queued drafts (needs SMTP_* in .env)

import { readFileSync } from 'node:fs'
import { callBrain } from '../src/lib/brain.js'
import { resolveAndIngest } from '../src/lib/hydra-resolve.js'

const HYDRA = 'https://api.hydradb.com'
const env = {}
try {
  for (const ln of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = ln.match(/^([A-Z_]+)=(.*)$/)
    if (m) env[m[1]] = m[2]
  }
} catch (e) { /* no .env */ }

const KEY = env.VITE_HYDRA_API_KEY
const TEN = env.VITE_HYDRA_TENANT_ID || 'default-tenant'
const SUB = env.VITE_HYDRA_SUB_TENANT_ID || 'demo-user'
const brainCfg = { apiKey: env.VITE_GROQ_API_KEY || env.VITE_NEBIUS_API_KEY || '', provider: env.VITE_NEBIUS_API_KEY ? 'nebius' : 'groq' }

const ts = () => new Date().toISOString().slice(11, 23)
const log = (...a) => console.log('[' + ts() + ']', ...a)
const H = (x) => Object.assign({ Authorization: 'Bearer ' + KEY, 'API-Version': '2' }, x || {})
let _seq = 0
const uid = (p) => p + '_' + Date.now() + '_' + (_seq += 1)

if (!KEY) { console.error('No HydraDB key in .env (VITE_HYDRA_API_KEY). Aborting.'); process.exit(1) }

async function hydraIngest(mem) {
  const f = new FormData()
  f.append('type', 'memory')
  f.append('tenant_id', TEN)
  f.append('sub_tenant_id', SUB)
  f.append('memories', JSON.stringify([{
    text: mem.content,
    infer: false,
    title: mem.kind,
    id: mem.id,
    metadata: {
      app: 'continuity',
      kind: mem.kind,
      status: mem.status || 'active',
      mem_id: mem.id,
      salience: String(mem.salience == null ? 0.6 : mem.salience),
      ...(mem.entity ? { entity: mem.entity } : {}),
      ...(mem.predicate ? { predicate: mem.predicate } : {}),
      created_at: String(Date.now()),
    },
    additional_metadata: { salience: String(mem.salience == null ? 0.6 : mem.salience) },
  }]))
  const r = await fetch(HYDRA + '/context/ingest', { method: 'POST', headers: H(), body: f })
  return r.status
}

async function hydraQuery(query, max = 50) {
  const r = await fetch(HYDRA + '/query', {
    method: 'POST',
    headers: H({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ tenant_id: TEN, sub_tenant_id: SUB, query, type: 'memory', query_by: 'hybrid', mode: 'fast', max_results: max }),
  })
  const d = await r.json().catch(() => ({}))
  const chunks = ((d.data && d.data.chunks) || []).filter((c) => (c.metadata || {}).app === 'continuity')
  return chunks.map((c) => {
    const m = c.metadata || {}
    return { id: m.mem_id || c.id, content: c.chunk_content, kind: m.kind, entity: m.entity || null, predicate: m.predicate || null, salience: Number(m.salience) || 0.5, status: m.status || 'active' }
  })
}

// IMPORT context from any source (paste a ChatGPT/Claude conversation, notes, etc.)
async function ingest(text) {
  if (text && text.startsWith('@')) text = readFileSync(text.slice(1), 'utf8')
  if (!text || !text.trim()) { log('nothing to ingest. pass text or @file.'); return }
  log('ingesting context (' + brainCfg.provider + ' brain) →', text.slice(0, 64) + '…')
  const res = await callBrain([], text, brainCfg)
  // Same resolve step as the web app + MCP server: a contradicting value
  // supersedes the prior memory in HydraDB instead of coexisting with it.
  const ports = { recall: (q, max) => hydraQuery(q, max), ingest: hydraIngest, uid }
  let n = 0
  let sup = 0
  for (const md of (res.memories || [])) {
    let content = (md.content || '').trim()
    if (/^[a-z]/.test(content)) content = 'The user ' + content
    const r = await resolveAndIngest({ content, kind: md.kind || 'fact', entity: md.entity || null, predicate: md.predicate || null, salience: md.salience }, ports)
    if (r.stored) { log('  + stored to HydraDB: ' + content.slice(0, 58)); n += 1 }
    for (const id of r.supersededIds) { log('  ~ superseded prior memory ' + id); sup += 1 }
  }
  log('done — ' + n + ' memories imported into HydraDB' + (sup ? ', ' + sup + ' superseded' : '') + '. They will appear in the web app on next load.')
}

// SCAN: the autonomous pass — find stale open loops and draft follow-ups
async function scan() {
  log('scan: pulling open loops from HydraDB…')
  const mems = await hydraQuery('user open loops follow ups interviews waiting to hear back lease')
  const loops = mems.filter((m) => m.kind === 'open_loop' && m.status === 'active')
  log('found ' + loops.length + ' active open loops')
  const drafts = []
  for (const loop of loops) {
    const who = loop.entity || 'them'
    const transcript = 'Draft a short, warm follow-up email to ' + who + ' that closes this open loop: "' + loop.content + '". Sign it from the user.'
    const res = await callBrain([loop], transcript, brainCfg)
    if (res.action && res.action.type === 'email_draft') {
      drafts.push({ loop, action: res.action })
      log('  drafted → ' + who + ' | subject: ' + res.action.subject)
      // record the autonomous action back into shared memory so the web app shows it
      await hydraIngest({ id: uid('act'), content: 'Continuity autonomously drafted a follow-up to ' + who + ' (awaiting your approval).', kind: 'open_loop', entity: who, predicate: 'follow_up', salience: 0.7 })
    }
  }
  log('scan complete — ' + drafts.length + ' follow-ups drafted + queued for your approval.')
  return drafts
}

// WATCH: 24/7 loop
async function watch(minutes) {
  const ms = Math.max(1, Number(minutes) || 30) * 60000
  log('24/7 watch — scanning every ' + (ms / 60000) + ' min. Ctrl+C to stop. (cron/pm2/cloud-ready)')
  await scan().catch((e) => log('scan error:', e.message))
  setInterval(() => { scan().catch((e) => log('scan error:', e.message)) }, ms)
}

// SEND: opt-in real send via SMTP (safe default = never send without --yes + config)
async function send() {
  if (process.argv.indexOf('--yes') === -1) { log('refusing to send without --yes (safety). re-run: node agent/agent.mjs send --yes'); return }
  if (!env.SMTP_HOST || !env.SMTP_USER) { log('SMTP not configured in .env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM). drafts stay queued.'); return }
  let nodemailer
  try { nodemailer = (await import('nodemailer')).default } catch (e) { log('run: npm i nodemailer'); return }
  const drafts = await scan()
  const tx = nodemailer.createTransport({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT) || 587, secure: Number(env.SMTP_PORT) === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } })
  for (const d of drafts) {
    const to = d.action.to || ''
    if (!to || to.indexOf('@') === -1) { log('  skip (no real email for ' + (d.loop.entity || '?') + ') — map entity→address first'); continue }
    await tx.sendMail({ from: env.SMTP_FROM || env.SMTP_USER, to, subject: d.action.subject, text: d.action.body })
    log('  SENT → ' + to)
  }
}

const mode = process.argv[2]
const fn = mode === 'ingest' ? () => ingest(process.argv.slice(3).join(' '))
  : mode === 'scan' ? scan
  : mode === 'watch' ? () => watch(process.argv[3])
  : mode === 'send' ? send
  : null
if (!fn) {
  console.log('Continuity autonomous agent\n  node agent/agent.mjs ingest "<text|@file>"\n  node agent/agent.mjs scan\n  node agent/agent.mjs watch [minutes]\n  node agent/agent.mjs send --yes')
  process.exit(0)
}
fn().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
