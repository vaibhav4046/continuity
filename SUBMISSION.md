# Continuity, submission

Paste these fields into the Hackathon Portal. Submission code: MEMORY2026.

## Name
Continuity

## One line
A self evolving personal memory agent that remembers what matters, forgets what does not, and acts on it, all on HydraDB.

## Track
Best Use of Memory and Context (primary). Also fits Best Agent People Love and Best Workflow Agent. Open Memory Track.

## The problem
Most agents have amnesia. The moment the tab closes, or you switch tools, or you hit a context limit, you start over and re explain who you are and what you were doing. The hard part was never generating text. It is remembering.

## What it does
Continuity gives an agent a memory that behaves like a person's. It reinforces what you use, it lets what you ignore decay and get forgotten, it supersedes the old truth when you contradict yourself, and it surfaces the right thing before you ask. Every memory lives in HydraDB, so it survives the tab closing, and it follows you across every tool through an MCP server.

## How it meets the mandatory requirements
1. HydraDB as the primary memory, context retrieval, and storage layer. Every memory is a real write to HydraDB (POST /context/ingest) and every recall is a real query (POST /query). The store status chip reads hydradb and the execution log shows green rows with request ids and latency. HydraDB also extracts the entity relation knowledge graph we render.
2. Persistent memory logic with autonomous recall across sessions. On load the agent queries HydraDB and restores its whole memory set, with the correct salience and due dates, and a banner confirms it. Reload the tab and the memory comes back. Start a new session and it proactively recalls your most pressing open loop without being asked.
3. Context aware execution. When you contradict yourself the agent finds the conflicting memory and supersedes it, then answers differently next time. When an open loop goes quiet it drafts a follow up for you to approve, and sending it flips that loop to resolved.

## Architecture
There are three surfaces over one HydraDB memory.
1. A web app, a single React site that flows from the landing into the live agent, with the engine panel, the knowledge graph, and the restore banner.
2. A 24 by 7 daemon (agent/agent.mjs) that runs on the same memory, scans open loops, and autonomously drafts follow ups, with opt in sending.
3. An MCP server (mcp/server.mjs) with seven tools, so Claude Code, Codex, Cursor, Gemini CLI, and OpenCode all share the same memory. You can checkpoint a session in one tool and resume it in another.

The engine is a seven stage pipeline: capture, extract, resolve, decay, retrieve, surface, act. Retrieval is a weighted score, not cosine top k. The same resolve step runs across all three surfaces, so a contradiction written from any tool supersedes the old value in HydraDB.

## Deliverables
1. Working prototype. Run npm install then npm run dev, open the link, hit Enter, and you can capture a memory, contradict it to see a supersede, start a new session for proactive recall, draft and send a follow up, and reload to watch the memory restore from HydraDB. Demo script is in DEMO_SCRIPT.md.
2. Source code. This repository, with the agent logic in src/lib and the HydraDB integration in src/lib/hydra-client.js, mcp/server.mjs, and agent/agent.mjs.
3. Execution logs. The in app execution log dock and the browser console trace every HydraDB write and query with a timestamp, the operation, the store, the status, the latency, and the request id. The HydraDB dashboard itself shows the memory tokens we consumed.
4. Pitch. See PITCH.md.

## Live link and run
Local: npm install, npm run dev, http://localhost:5173.
Hosted: deploy to Vercel (vercel.json is included; it proxies /hydra to HydraDB at the edge). Set the env vars VITE_HYDRA_API_KEY, VITE_HYDRA_TENANT_ID, VITE_HYDRA_SUB_TENANT_ID, VITE_GROQ_API_KEY, VITE_BRAIN_PROVIDER, then the single hosted URL is the submission link.

## Use cases
A cross tool coding copilot that carries your context between Codex, Cursor, and Claude Code. A personal follow up agent that never drops a promise. A relationship and meeting memory you can ask. Any repetitive AI interaction where context is lost today.
