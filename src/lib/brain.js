// brain.js — ONE callBrain(memories, transcript) function. Provider swappable
// in one line (Nebius primary, Groq fallback; both OpenAI-compatible). If the
// network/LLM fails OR no key is set, a deterministic local heuristic keeps the
// demo alive (keyword extraction + templated reply + templated email draft).

// ---------- local deterministic extractor (also the LLM safety net) ----------
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const PREDICATE_RULES = [
  { p: 'meeting_time', re: /\b(morning|afternoon|evening)\b.*\b(meeting|meetings|call|calls)\b/i },
  { p: 'follow_up', re: /\b(follow up|follow-up|hear back|heard back|waiting to hear|chase up|circle back|lease)\b/i },
  { p: 'employer', re: /\b(work|works|working|job|joined|hired)\b.*\b(at|for|with)\b|\bnew job\b/i },
  { p: 'interview', re: /\binterview(ed|ing)?\b/i },
  { p: 'meeting', re: /\b(meeting|call|sync|catch up|coffee)\b.*\bwith\b/i },
  { p: 'location', re: /\b(live|lives|living|moving|relocat)\w*\b/i },
  { p: 'deadline', re: /\b(deadline|due|submit|application|apply)\b/i },
]

const OPEN_LOOP_RE = /\b(interview|follow up|follow-up|hear back|heard back|waiting|get back|deadline|due|apply|application|chase|owe|reply|circle back|meeting with|call with)\b/i
const PREF_RE = /\bi\s+(prefer|like|love|hate|always|never|usually|can't stand|cannot stand)\b/i
const FACT_RE = /\b(my|i am|i'm|i work|works at|lives in|i live)\b/i

function findEntity(text) {
  const words = text.split(/\s+/)
  for (let i = 0; i < words.length; i += 1) {
    const clean = words[i].replace(/[^A-Za-z]/g, '')
    if (i > 0 && /^[A-Z][a-z]+$/.test(clean) && WEEKDAYS.indexOf(clean.toLowerCase()) === -1) return clean
  }
  return null
}

function findDue(text) {
  const lower = text.toLowerCase()
  for (const d of WEEKDAYS) {
    if (lower.indexOf(d) !== -1) {
      const idx = WEEKDAYS.indexOf(d)
      const date = new Date()
      const diff = ((idx - date.getDay() + 7) % 7) || 7
      date.setDate(date.getDate() + diff)
      return date.getTime()
    }
  }
  if (/\btomorrow\b/.test(lower)) return Date.now() + 24 * 3600 * 1000
  if (/\bnext week\b/.test(lower)) return Date.now() + 7 * 24 * 3600 * 1000
  return null
}

function predicateFor(text) {
  for (const rule of PREDICATE_RULES) if (rule.re.test(text)) return rule.p
  return null
}

function classify(text) {
  if (OPEN_LOOP_RE.test(text)) return { kind: 'open_loop', salience: 0.85 }
  if (PREF_RE.test(text)) return { kind: 'preference', salience: 0.62 }
  if (FACT_RE.test(text)) return { kind: 'fact', salience: 0.5 }
  return { kind: 'chatter', salience: 0.26 }
}

function toThirdPerson(text) {
  let t = text.trim().replace(/^\s*(well|so|okay|ok|um|uh|hey|also|and|but|actually)\b[,\s]*/i, '')
  t = t.replace(/\bI'm\b/g, 'The user is')
    .replace(/\bI am\b/gi, 'The user is')
    .replace(/\bI've\b/g, 'The user has')
    .replace(/\bI'll\b/g, 'The user will')
    .replace(/\bI\b/g, 'The user')
    .replace(/\bmy\b/gi, "the user's")
    .replace(/\bme\b/gi, 'the user')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Display-time only: render stored third-person memory ("The user is...") as
// natural second person ("You're...") for user-facing text. Never mutates what
// is stored in HydraDB — the canonical form stays third-person for the engine.
const USER_NAME = (import.meta.env && import.meta.env.VITE_USER_NAME) || 'Me'
export function toSecondPerson(text) {
  if (!text) return text
  return String(text)
    .replace(/\bThe user's\b/g, 'Your').replace(/\bthe user's\b/g, 'your')
    .replace(/\bThe user is\b/g, "You're").replace(/\bthe user is\b/g, "you're")
    .replace(/\bThe user has been\b/g, "You've been").replace(/\bthe user has been\b/g, "you've been")
    .replace(/\bThe user has\b/g, 'You have').replace(/\bthe user has\b/g, 'you have')
    .replace(/\bThe user will\b/g, "You'll").replace(/\bthe user will\b/g, "you'll")
    .replace(/\bThe user ([a-z]+)s\b/g, 'You $1').replace(/\bthe user ([a-z]+)s\b/g, 'you $1')
    .replace(/\bThe user\b/g, 'You').replace(/\bthe user\b/g, 'you')
}

export function extractMemories(text) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 3)
  const source = sentences.length ? sentences : [text]
  const drafts = []
  for (const s of source) {
    const c = classify(s)
    if (c.kind === 'chatter' && source.length > 1) continue
    drafts.push({
      content: toThirdPerson(s),
      kind: c.kind,
      salience: c.salience,
      entity: findEntity(s),
      predicate: predicateFor(s),
      due_hint: findDue(s),
    })
  }
  return drafts.slice(0, 3)
}

// Coarse conflict slot, derived locally so it is consistent whether the memory
// came from the LLM (which omits it) or the heuristic extractor. Only SPECIFIC
// slots (meeting_time, employer, interview, location, deadline...) — never a
// catch-all, so unrelated facts/preferences can't wrongly supersede each other.
export function derivePredicate(content) {
  return predicateFor(content)
}

// ---------- the brain ----------
const SYSTEM_PROMPT = 'You are Continuity, a warm, concise personal memory agent. You remember what matters across sessions and help close open loops. Given the person\'s stored memories and the conversation, for the latest user message: (1) reply briefly and humanly; (2) extract any NEW durable memories — open_loops (anything needing future follow-up) are salience 0.8+, return [] if none. Each memory.content MUST be a complete third-person sentence beginning with "The user", with entity set to the key person or organization when present; (3) if the user approves or asks for an action, propose an email_draft signed by the user, else null. Return ONLY valid JSON, no markdown.'

// Swap provider in one line via VITE_BRAIN_PROVIDER (nebius | groq).
const PROVIDERS = {
  nebius: { base: 'https://api.studio.nebius.com/v1', model: 'meta-llama/Meta-Llama-3.1-70B-Instruct' },
  groq: { base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
}

const ACTION_RE = /\b(draft|send|email|write to|reach out|compose)\b/i

function stripFences(s) { return String(s).replace(/```json/gi, '').replace(/```/g, '').trim() }
function safeParse(raw) {
  try { return JSON.parse(stripFences(raw)) } catch (e) { /* fall through */ }
  const m = stripFences(raw).match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch (e) { /* ignore */ } }
  return null
}

async function callLLM(memories, transcript, config) {
  const provider = PROVIDERS[config.provider] || PROVIDERS.nebius
  const memLines = memories.map((m) => '- (' + m.kind + (m.entity ? ', ' + m.entity : '') + ') ' + m.content).join('\n') || '(none yet)'
  const userContent = 'Stored memories:\n' + memLines + '\n\nLatest user message:\n' + transcript +
    '\n\nReturn JSON: {"reply": string, "memories": [{"content": third-person string, "kind": "fact|preference|open_loop", "salience": number, "entity": string, "time_hint": string|null}], "action": {"type":"email_draft","to":string,"subject":string,"body":string} | null}'
  const resp = await fetch(provider.base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.apiKey },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
    }),
  })
  if (!resp.ok) throw new Error('brain HTTP ' + resp.status)
  const data = await resp.json()
  const parsed = safeParse((((data.choices || [])[0] || {}).message || {}).content || '')
  if (!parsed || typeof parsed.reply !== 'string') throw new Error('bad brain json')
  return {
    reply: parsed.reply,
    memories: Array.isArray(parsed.memories) ? parsed.memories : [],
    action: parsed.action && parsed.action.type === 'email_draft' ? parsed.action : null,
    source: 'llm',
  }
}

function buildAction(text, memories) {
  const loop = memories.find((m) => m.kind === 'open_loop' && m.status !== 'resolved') || null
  const who = (loop && loop.entity) || 'there'
  let topic = loop
    ? loop.content.replace(/^The user('s)?\s*(has|is|will|has been|had|was|wants?|needs?|is waiting)?\s*/i, '').replace(/\.$/, '')
    : 'our last conversation'
  // Writing TO this person, so drop "with <them>" and shift to first person.
  if (who !== 'there') topic = topic.replace(new RegExp('\\s*\\bwith ' + who + '\\b', 'i'), '')
  topic = topic.replace(/\bthe user's\b/gi, 'my').replace(/\bthe user\b/gi, 'I')
  return {
    type: 'email_draft',
    to: who !== 'there' ? who : '',
    subject: loop && loop.entity ? 'Following up, ' + loop.entity : 'Quick follow-up',
    body: 'Dear ' + who + ',\n\nI wanted to follow up on ' + topic + '. Any update when you get a moment?\n\nBest,\n' + USER_NAME,
  }
}

function buildReply(drafts, isActionCmd) {
  if (isActionCmd) return 'Done — I drafted that for you. Review it and hit send when it looks right.'
  const loop = drafts.find((d) => d.kind === 'open_loop')
  const pref = drafts.find((d) => d.kind === 'preference')
  if (loop) {
    const who = loop.entity ? ' with ' + loop.entity : ''
    return 'Got it — I\'ll hold that open loop' + who + ' and resurface it if it goes quiet. Want me to draft a follow-up?'
  }
  if (pref) return 'Noted — I\'ll remember that and weigh it going forward.'
  if (drafts.length) return 'Logged. I\'ll keep that in mind for you.'
  return 'I\'m listening. Tell me what\'s on your plate and I\'ll keep track of it.'
}

export function heuristicBrain(memories, transcript) {
  const isActionCmd = ACTION_RE.test(transcript)
  const drafts = isActionCmd ? [] : extractMemories(transcript)
  const action = isActionCmd ? buildAction(transcript, memories) : null
  return { reply: buildReply(drafts, isActionCmd), memories: drafts, action, source: 'local' }
}

// Bulletproof safety beat: if the latest message is about a prescription and a
// stored allergy makes it dangerous, surface the recall as a warning. Fires
// whether the reply came from the LLM or the local heuristic.
const RX_RE = /\b(prescrib|antibiotic|medication|medicine|pill|dose|amoxicillin|penicillin|put (you|me) on|take this)\b/i
const PENICILLIN_CLASS = /\b(penicillin|amoxicillin|ampicillin|augmentin|amoxil|methicillin|flucloxacillin|piperacillin)\b/i
export function allergyGuard(transcript, memories) {
  if (!RX_RE.test(transcript)) return null
  const allergy = (memories || []).find((m) => /allerg/i.test(m.content) && /penicillin/i.test(m.content) && m.status !== 'superseded')
  if (!allergy) return null
  const med = (transcript.match(PENICILLIN_CLASS) || [])[0]
  if (!med) return null
  return 'Heads up: you told me you are allergic to penicillin, and ' + med.toLowerCase() + ' is penicillin-class. Flag this with the prescriber before taking it.'
}

export async function callBrain(memories, transcript, config = {}) {
  let result = null
  if (config.apiKey) {
    try { result = await callLLM(memories, transcript, config) }
    catch (err) { console.warn('[brain] LLM failed -> local fallback:', err.message) }
  }
  if (!result) result = heuristicBrain(memories, transcript)
  const warn = allergyGuard(transcript, memories)
  if (warn) result = { ...result, reply: warn + (result.reply ? '\n\n' + result.reply : ''), guard: true }
  return result
}
