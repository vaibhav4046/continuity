# Continuity — Agents You Love Hackathon

**Build agents that remember and evolve. Continuity is a personal memory agent that
remembers what matters, forgets what doesn't, and closes your open loops before you ask.**

Tracks: **Best Use of Memory / Context** (primary) · **Best Agent People Love** (secondary).

---

## The amnesia problem
Most agents die at the tab close. They re-ask what you already told them. Or they hoard
every message forever and drown in noise. Neither is how a person remembers.

## Continuity
A memory that behaves like a person's: it **reinforces** on use, **decays** when ignored,
**supersedes** itself on contradiction, **surfaces** the right thing unprompted — and
persists across sessions in **HydraDB**.

---

## Mandatory requirements — how we meet them

**1. HydraDB as the primary memory / context / storage layer.**
Every memory is written to HydraDB (`POST /context/ingest`) and recalled from it
(`POST /query`). On startup the agent **restores the user's whole memory set from HydraDB**
(`hydra.loadAll()` → rebuild records) — that is the "remember after the tab closes" proof.
HydraDB is the system of record; an in-memory working set is the hot tier for instant,
deterministic UI (mirrors HydraDB's own tiered-memory model).

**2. Persistent memory logic — autonomous recall across sessions.**
- Close the tab, reopen → memories come back from HydraDB (restore on load).
- "New session" clears the conversation, keeps memory, and the agent **proactively** opens
  with your top unresolved loop: *"Did you hear back from Katie? Want me to draft a follow-up?"*

**3. Context-aware execution — action changes with stored history.**
- Tell it *"I prefer afternoon meetings now"* → it finds the contradicting memory and
  **supersedes** it (old struck through, new active), then answers differently next time.
- Ask it to follow up → it drafts an email from the remembered open loop and, on send,
  flips that loop to **resolved**.

## Execution-log deliverable
A live **execution-log dock** (and the console) trace every HydraDB op with timestamp, op,
store, status, latency, and `request_id`:
```
SYSTEM hydradb  ok     HydraDB connected · tenant=default-tenant · durable primary
QUERY  hydradb  ok     restored 5 memories from HydraDB · 278ms · 85766284-5129-42c…
WRITE  hydradb  ok     ingest "The user has an interview with Katie..." · req_c1d2
QUERY  hydradb  ok     recall "any update on Katie?" · 5 chunks · req_77af
```
This is the proof the agent autonomously wrote to and queried HydraDB.

---

## The 7-stage Memory Engine (`src/lib/engine.js`)
Capture → Extract → Resolve → Decay → Retrieve → Surface → Act. ~96% deterministic code,
~4% AI. Retrieval is a weighted score (semantic + salience + recency + entity + open-loop),
not cosine top-k. Decay is `salience · exp(-Δt/τ[kind])`. Contradiction supersedes on a
matching entity+predicate slot.

## Stack
React + Vite SPA · **HydraDB** (memory) · **Nebius**/Groq (brain, OpenAI-compatible, swappable
in one line) · Web Speech (voice). No localStorage/sessionStorage — persistence is HydraDB.

## 2-minute demo
1. Open → engine panel already holds memory; a trivia item has **decayed to "forgotten"** (live).
2. **New session** → proactive recall: *"Did you hear back from Katie?"*
3. *"Actually I prefer afternoon meetings now"* → old preference **superseded** live.
4. *"Draft a follow-up to Katie"* → email card → **Send** → loop **resolved**.
5. Point at the **execution-log dock** → real HydraDB writes/queries with request ids + latency.
6. **Reload the tab** → memories **restored from HydraDB**. No amnesia.

## Roadmap — Continuity, everywhere you talk
Today it remembers your conversation with the agent. Next it remembers *all* of them:
ingest from **Telegram, WhatsApp, and Instagram**, run **24/7**, and — because it never
acts without consent — **notify you to approve before it drafts or sends**. The live
"agent drafts → you approve → loop closes" flow is the honest seed of exactly that. The
memory engine + HydraDB knowledge graph already generalize across channels; the work left
is the connectors, not the brain.

## Live marketing page
A Lovable-built landing page (same black-gold / pixel-glitch / knowledge-graph identity,
distinct from any sponsor site) showcases the product and links to the live demo.

## Run
```bash
npm install
npm run dev   # http://localhost:5173   (/#app jumps straight in)
```
Set `VITE_HYDRA_API_KEY` + `VITE_HYDRA_TENANT_ID` in `.env` for the live HydraDB path
(calls route through the dev-server `/hydra` proxy — HydraDB has no browser CORS). Add
`VITE_NEBIUS_API_KEY` for the Nebius brain.

Submission: Hackathon Portal, code **MEMORY2026** (demo + repo + execution-log traces).
