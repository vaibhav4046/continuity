#!/usr/bin/env node
// Continuity MCP server — exposes your live HydraDB memory as MCP tools so ANY
// MCP client (Claude Code, Codex, Gemini CLI, OpenCode, Cursor, ...) shares the
// same 24/7 context. Recall pulls fresh from HydraDB on every call; remember
// writes back. One memory, every tool.
//
// Run:  node mcp/server.mjs   (stdio transport)
// Register it in your client's MCP config (see README).

import { readFileSync } from 'node:fs'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
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
const H = (x) => Object.assign({ Authorization: 'Bearer ' + KEY, 'API-Version': '2' }, x || {})
let _seq = 0
const uid = (p) => p + '_' + Date.now() + '_' + (_seq += 1)
const text = (s) => ({ content: [{ type: 'text', text: s }] })

async function hydraIngest(mem) {
  const f = new FormData()
  f.append('type', 'memory')
  f.append('tenant_id', TEN)
  f.append('sub_tenant_id', SUB)
  f.append('memories', JSON.stringify([{
    text: mem.content, infer: false, title: mem.kind, id: mem.id,
    metadata: {
      app: 'continuity', kind: mem.kind, status: mem.status || 'active', mem_id: mem.id,
      salience: String(mem.salience == null ? 0.6 : mem.salience),
      ...(mem.entity ? { entity: mem.entity } : {}),
      ...(mem.predicate ? { predicate: mem.predicate } : {}),
      created_at: String(Date.now()),
    },
    additional_metadata: { salience: String(mem.salience == null ? 0.6 : mem.salience) },
  }]))
  const r = await fetch(HYDRA + '/context/ingest', { method: 'POST', headers: H(), body: f })
  return r.ok
}

async function hydraQuery(query, max = 10, mode = 'fast', graph = false) {
  const r = await fetch(HYDRA + '/query', {
    method: 'POST', headers: H({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ tenant_id: TEN, sub_tenant_id: SUB, query, type: 'memory', query_by: 'hybrid', mode, max_results: max, graph_context: graph }),
  })
  const d = await r.json().catch(() => ({}))
  return d.data || {}
}

function toMem(c) {
  const m = c.metadata || {}
  return { id: m.mem_id || c.id, content: c.chunk_content, kind: m.kind, entity: m.entity || null, predicate: m.predicate || null, salience: Number(m.salience) || 0.5, status: m.status || 'active' }
}

const TOOLS = [
  { name: 'continuity_recall', description: 'Recall the most relevant memories about the user from Continuity (HydraDB). Use at the START of a task to load the user context: preferences, facts, and open loops.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'What to recall, e.g. "the user tech stack" or "open follow-ups".' }, limit: { type: 'number', description: 'Max memories (default 6).' } }, required: ['query'] } },
  { name: 'continuity_remember', description: 'Persist new durable context about the user to Continuity (HydraDB) so every tool sees it later. Pass natural text; it is extracted into structured memories.', inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'What to remember, e.g. "I prefer TypeScript and pnpm; I have an interview with Katie Tuesday."' } }, required: ['text'] } },
  { name: 'continuity_open_loops', description: 'List the user active open loops (things needing follow-up) from Continuity.', inputSchema: { type: 'object', properties: {} } },
  { name: 'continuity_draft_follow_up', description: 'Draft a follow-up email that closes one of the user open loops. Returns To/Subject/Body for approval (does not send).', inputSchema: { type: 'object', properties: { entity: { type: 'string', description: 'Who to follow up with (optional; defaults to the most salient open loop).' } } } },
  { name: 'continuity_graph', description: 'Return Continuity knowledge graph (entities + relations) extracted by HydraDB from the user memories.', inputSchema: { type: 'object', properties: {} } },
  { name: 'continuity_checkpoint', description: 'Save the current working session (a summary of what you are doing, decisions, and next steps) to HydraDB so you can RESUME it in any other tool. Call this when your context window is running out before switching tools.', inputSchema: { type: 'object', properties: { summary: { type: 'string', description: 'Concise summary of the work: goal, decisions made, current state.' }, project: { type: 'string', description: 'Project / repo name (optional, used to filter on resume).' }, next_steps: { type: 'string', description: 'What to do next (optional).' } }, required: ['summary'] } },
  { name: 'continuity_resume', description: 'Resume where you left off in another tool: returns the most recent session checkpoint (summary + next steps) plus your relevant memories. Call this at the START of a new tool/session to reload everything.', inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'Project / repo to resume (optional).' } } } },
]

async function handle(name, args) {
  if (!KEY) return text('Continuity is not configured (no HydraDB key in .env).')
  if (name === 'continuity_recall') {
    const data = await hydraQuery(String(args.query || ''), Number(args.limit) || 6)
    const mems = (data.chunks || []).filter((c) => (c.metadata || {}).app === 'continuity').map(toMem)
    if (!mems.length) return text('No relevant memories found.')
    return text('Continuity recall (' + mems.length + '):\n' + mems.map((m) => '- [' + m.kind + (m.entity ? ', ' + m.entity : '') + '] ' + m.content).join('\n'))
  }
  if (name === 'continuity_remember') {
    const res = await callBrain([], String(args.text || ''), brainCfg)
    // Route every extracted memory through the SAME resolve step the web app
    // uses (engine.js resolveMemory) so a contradicting value supersedes the
    // prior one in HydraDB instead of silently coexisting with it.
    const ports = {
      recall: async (q, max) => {
        const data = await hydraQuery(q, max)
        return (data.chunks || []).filter((c) => (c.metadata || {}).app === 'continuity').map(toMem)
      },
      ingest: hydraIngest,
      uid,
    }
    const stored = []
    const superseded = []
    for (const md of (res.memories || [])) {
      let content = (md.content || '').trim()
      if (/^[a-z]/.test(content)) content = 'The user ' + content
      const r = await resolveAndIngest({ content, kind: md.kind || 'fact', entity: md.entity || null, predicate: md.predicate || null, salience: md.salience }, ports)
      if (r.stored) stored.push(content)
      superseded.push(...r.supersededIds)
    }
    const lines = []
    if (stored.length) lines.push('Remembered ' + stored.length + ' to HydraDB:\n' + stored.map((s) => '- ' + s).join('\n'))
    if (superseded.length) lines.push('Superseded ' + superseded.length + ' contradicted memor' + (superseded.length === 1 ? 'y' : 'ies') + '.')
    return text(lines.length ? lines.join('\n') : 'Nothing durable to store from that.')
  }
  if (name === 'continuity_open_loops') {
    const data = await hydraQuery('open loops follow ups interviews waiting to hear', 50)
    const loops = (data.chunks || []).filter((c) => (c.metadata || {}).app === 'continuity').map(toMem).filter((m) => m.kind === 'open_loop' && m.status === 'active')
    return text(loops.length ? 'Open loops (' + loops.length + '):\n' + loops.map((m) => '- ' + (m.entity ? m.entity + ': ' : '') + m.content).join('\n') : 'No open loops.')
  }
  if (name === 'continuity_draft_follow_up') {
    const data = await hydraQuery('open loops follow ups ' + (args.entity || ''), 50)
    let loops = (data.chunks || []).filter((c) => (c.metadata || {}).app === 'continuity').map(toMem).filter((m) => m.kind === 'open_loop' && m.status === 'active')
    if (args.entity) loops = loops.filter((m) => (m.entity || '').toLowerCase() === String(args.entity).toLowerCase()).concat(loops)
    const loop = loops[0]
    if (!loop) return text('No open loop to follow up on.')
    const who = loop.entity || 'them'
    const res = await callBrain([loop], 'Draft a short warm follow-up email to ' + who + ' to close: "' + loop.content + '". Sign from the user.', brainCfg)
    const a = res.action || {}
    return text('Draft (for approval, not sent):\nTo: ' + (a.to || who) + '\nSubject: ' + (a.subject || '') + '\n\n' + (a.body || ''))
  }
  if (name === 'continuity_graph') {
    const data = await hydraQuery('user katie daniel interview lease meetings preferences', 10, 'thinking', true)
    const paths = (data.graph_context && data.graph_context.query_paths) || []
    const edges = []
    for (const p of paths) for (const t of (p.triplets || [])) if (t.source && t.target) edges.push(t.source.name + ' --' + ((t.relation && t.relation.raw_predicate) || '') + '--> ' + t.target.name)
    const uniq = [...new Set(edges)]
    return text(uniq.length ? 'Continuity knowledge graph (HydraDB):\n' + uniq.map((e) => '- ' + e).join('\n') : 'No graph relations yet.')
  }
  if (name === 'continuity_checkpoint') {
    const summary = String(args.summary || '').trim()
    if (!summary) return text('Provide a summary to checkpoint.')
    const proj = args.project ? String(args.project) : null
    const next = args.next_steps ? '\nNext: ' + args.next_steps : ''
    const content = 'Session checkpoint' + (proj ? ' [' + proj + ']' : '') + ': ' + summary + next
    await hydraIngest({ id: uid('sess'), content, kind: 'session', entity: proj, predicate: proj ? 'project:' + proj.toLowerCase() : null, salience: 0.95 })
    return text('Checkpoint saved to HydraDB. Resume it from any tool with continuity_resume' + (proj ? ' (project=' + proj + ')' : '') + '.')
  }
  if (name === 'continuity_resume') {
    const proj = args.project ? String(args.project).toLowerCase() : null
    const data = await hydraQuery('session checkpoint summary where I left off coding ' + (args.project || ''), 50)
    const mems = (data.chunks || []).filter((c) => (c.metadata || {}).app === 'continuity').map((c) => ({ ...toMem(c), created: Number((c.metadata || {}).created_at) || 0 }))
    let sessions = mems.filter((m) => m.kind === 'session')
    if (proj) {
      const matched = sessions.filter((m) => (m.predicate || '').includes('project:' + proj) || (m.entity || '').toLowerCase() === proj)
      if (matched.length) sessions = matched
    }
    sessions.sort((a, b) => b.created - a.created)
    const latest = sessions[0]
    const ctxData = await hydraQuery('user preferences facts open loops follow ups interviews', 8)
    const ctx = (ctxData.chunks || []).filter((c) => (c.metadata || {}).app === 'continuity').map(toMem).filter((m) => m.kind !== 'session').slice(0, 6)
    let out = latest ? 'Resuming your last session:\n' + latest.content + '\n\n' : 'No prior session checkpoint found.\n\n'
    if (ctx.length) out += 'Your relevant context:\n' + ctx.map((m) => '- [' + m.kind + (m.entity ? ', ' + m.entity : '') + '] ' + m.content).join('\n')
    return text(out.trim())
  }
  return text('Unknown tool: ' + name)
}

const server = new Server({ name: 'continuity', version: '1.0.0' }, { capabilities: { tools: {} } })
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try { return await handle(req.params.name, req.params.arguments || {}) }
  catch (e) { return text('Continuity error: ' + e.message) }
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[continuity-mcp] ready · tenant=' + TEN + ' · ' + TOOLS.length + ' tools')
