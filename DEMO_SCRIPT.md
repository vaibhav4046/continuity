# Continuity — 5-Minute Demo Video Script

**For:** Agents You Love hackathon · tracks: Best Use of Memory/Context (primary), Best Agent People Love, Best Workflow Agent.
**How to use:** screen-record the live app (`npm run dev` → http://localhost:5173) following the on-screen actions; read the VOICEOVER aloud (or feed it to any TTS); burn the SUBTITLE lines as captions. ~750 words ≈ 5:00 at a calm pace.

> Before recording: `npm run dev`, confirm the store chip shows **hydradb** and the log is green. Have a terminal ready for the MCP + daemon beats.

---

### 0:00 – 0:25 · The problem (hook)
**ON SCREEN:** the landing site, slow scroll past the hero + sections.
**VOICEOVER:** "Every AI tool you use has amnesia. Close the tab, switch apps, hit the context limit — and you start over, re-explaining who you are and what you were doing. The hard part was never generating text. It's *remembering*."
**SUBTITLE:** Every AI tool forgets. The hard part isn't generating — it's remembering.

### 0:25 – 0:45 · What Continuity is
**ON SCREEN:** click **ENTER CONTINUITY** → the app loads; point at `brain: live` and `store: hydradb`.
**VOICEOVER:** "This is Continuity — a self-evolving memory agent built on HydraDB. It remembers what matters, forgets what doesn't, and acts on it. Not a vector store with a chat box — a memory that behaves like a person's."
**SUBTITLE:** Continuity — a self-evolving memory agent, live on HydraDB.

### 0:45 – 1:25 · Capture → contradiction → decay (the engine, live)
**ON SCREEN:** type *"I have an interview with Katie at Northwind on Tuesday"* → a memory chip appears (logo pulses). Then type *"Actually, I prefer afternoon meetings now"* → the old "morning meetings" memory strikes through; the new one supersedes it.
**VOICEOVER:** "Watch the engine work. I tell it something — it captures a structured memory in HydraDB. I contradict myself — and instead of hoarding both, it *supersedes* the old truth with the new one, keeping an audit trail. Trivia I never mention again just decays and is forgotten. Reinforce, decay, supersede — that's a self-evolving memory."
**SUBTITLE:** Capture → contradiction supersedes the old truth → trivia decays. Self-evolving.

### 1:25 – 2:05 · Proactive recall + act (closes the loop)
**ON SCREEN:** click **New session** → agent opens with *"Did you hear back from Katie? Want me to draft a follow-up?"*. Type *"yes, draft it"* → an email card appears → click **Send & close loop** → the Katie loop flips to **resolved** (green), toast confirms.
**VOICEOVER:** "New session — and before I say anything, it surfaces my most pressing open loop, unprompted. I say yes; it drafts the follow-up email for me to approve, I send, and the loop closes. It asks before it acts — it never sends on its own."
**SUBTITLE:** Proactive recall → drafts the follow-up → you approve → loop closed. Asks before it acts.

### 2:05 – 2:35 · The proof — execution log + knowledge graph
**ON SCREEN:** open the **execution-log dock** (green `hydradb ok` rows with request_ids + latency). Point at the **memory graph** panel (entities + relations).
**VOICEOVER:** "Every memory is a real write to HydraDB, every recall a real query — here's the live execution log with request IDs and latency, the proof it's genuinely on HydraDB, not faked. And HydraDB extracts a real knowledge graph: user → has → interview → with → Katie; Katie → works at → Northwind."
**SUBTITLE:** Real HydraDB writes + queries (request IDs, latency) + a real knowledge graph.

### 2:35 – 3:10 · The amnesia-killer — restore across sessions
**ON SCREEN:** click the banner's **RELOAD TO PROVE IT** (or refresh). The app reloads → banner: *"N memories restored from HydraDB."*
**VOICEOVER:** "Here's the moment the whole hackathon is about. I close the tab and reopen it — and the agent *autonomously recalls its memory from HydraDB*, with the right salience, the due dates, everything. No amnesia when the tab closes. Context that survives."
**SUBTITLE:** Reload → memory restored from HydraDB. No amnesia when the tab closes.

### 3:10 – 4:00 · One memory, every tool (MCP cross-tool handoff)
**ON SCREEN:** terminal — show Continuity registered as an MCP server. In "tool A" call `continuity_checkpoint` with a coding-session summary; in "tool B" (a second client) call `continuity_resume` → the full summary + context comes back.
**VOICEOVER:** "Continuity is also an MCP server — so Claude Code, Codex, Cursor, Gemini CLI all share the *same* memory. Watch: I'm coding, my context runs out, I checkpoint my session. I switch tools — and resume exactly where I left off, summary and all. One memory, every tool. No re-explaining yourself across apps."
**SUBTITLE:** MCP server — checkpoint in one tool, resume in another. One memory, every tool.

### 4:00 – 4:30 · 24/7 autonomous worker
**ON SCREEN:** terminal — `npm run agent scan` → it drafts follow-ups for stale open loops; reload the app → those drafts appear.
**VOICEOVER:** "And it doesn't only work when you're watching. A 24/7 daemon runs on the same memory — it scans your open loops, autonomously drafts the follow-ups you'd forget, and queues them for approval. It worked for me while I was away."
**SUBTITLE:** A 24/7 daemon autonomously drafts your follow-ups — it works while you're away.

### 4:30 – 5:00 · Close
**ON SCREEN:** back to the landing footer / the graph.
**VOICEOVER:** "Continuity owns a workflow end-to-end on long-term memory: it remembers across sessions, evolves as you change, and acts — a live UI, a 24/7 worker, and an MCP layer every tool shares, all on HydraDB. The roadmap: ingest from Telegram, WhatsApp, and your inbox, 24/7, approve-from-chat. This is context over amnesia — and it's already real. Thank you."
**SUBTITLE:** Remembers · evolves · acts — one memory across every tool, live on HydraDB.

---

## Mandatory requirements hit on camera (call these out)
- **HydraDB as primary memory** → the execution log + store chip (2:05) and restore (2:35).
- **Autonomous recall across sessions** → reload-to-restore (2:35) + proactive greeting (1:25).
- **Context-aware execution** → supersede (0:45) + draft/send (1:25).
- **Execution-log proof** → the log dock (2:05).

## Complexity / use cases to mention if time allows
Maps to tracks 2 (Context-Rich Copilot — the MCP cross-tool handoff *is* this), 7 (Meeting Memory — the knowledge graph), and 10 (Open Memory). The hard parts: a 7-stage engine that supersedes on contradiction, string-metadata round-trip fidelity on restore, a shared resolve step across web + MCP + daemon, and a same-origin proxy for HydraDB's no-CORS API.
