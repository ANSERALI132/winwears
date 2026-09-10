# Token usage audit — 10 September 2026

Prompted by roughly 1.3 M input tokens showing on the Anthropic dashboard for
9–10 September. This is an audit of the WIN WEARS project and of the Claude
Code configuration on this machine. It was written before anything was
changed; §7 records the four fixes that followed and the commits they landed in.

**Headline: nothing is looping and nothing is running behind your back.** There
is no hook, no scheduled task, no watcher, no subagent and no background
process that calls Claude. The tokens are explained by two ordinary things — a
test suite that quietly makes real model calls, and one Claude Code session
that has been open since 6 September.

---

## 1. What was inspected

| Area | Result |
| --- | --- |
| Project `.claude/` directory | **does not exist** |
| Project `.mcp.json` / MCP servers | none configured for this project |
| User `~/.claude/settings.json` | two keys only: `agentPushNotifEnabled`, one marketplace registration |
| Hooks (`~/.claude/hooks`, project hooks) | **none** |
| Skills (`~/.claude/skills`) | **none installed** |
| Agents / subagents (`~/.claude/agents`) | **none defined**; 0 subagent calls in 3,471 model calls |
| Slash commands (`~/.claude/commands`) | **none** |
| Plugins | marketplace registered, **nothing installed** |
| Windows scheduled tasks | none matching claude / node / winwears |
| Startup (Run keys) | OneDrive and Edge only |
| Running processes | 12 `claude` processes — all one desktop-app launch today, 07:11–07:15. No stray `node`. |
| `CLAUDE.md` files | exactly one, 6,621 bytes, at the repo root |
| Duplicated project instructions | none |

## 2. Loops, recursion, retries, polling

Everything found, and what it actually does:

| Location | What it is | Calls the model? | Severity |
| --- | --- | --- | --- |
| `backend/src/lib/sweep.ts:60` | `setInterval` every `AUTOMATION_SWEEP_MINUTES` (15) — automation rules and webhook retries | **No** | LOW |
| `backend/src/lib/sessionStore.ts:20` | `setInterval` expiring dead sessions | No | LOW |
| `backend/src/ai/conversation.ts:157` | tool loop, `for iteration < AI_MAX_TOOL_ITERATIONS` (**6**) | Yes, bounded | MEDIUM |
| `backend/src/ai/copilot/thread.ts:120` | the same loop for the admin copilot, the same cap of 6 | Yes, bounded | MEDIUM |
| `backend/src/ai/providers/anthropic.ts:88` | SDK client, `maxRetries: 1`, `timeout: 30_000` | Yes, one retry | LOW |
| `backend/src/lib/webhooks.ts` | outbound delivery retries with backoff | No | LOW |
| `admin/js/app.js:349`, `view-notifications.js:113` | browser polls a count every 60 s | No | LOW |

Every loop has a hard bound. There is no `while (true)`, no recursion into the
model, no agent that spawns an agent, and nothing that re-invokes Claude Code.

## 3. The measurements that matter

Recorded usage read out of the Claude Code transcripts on this machine
(`~/.claude/projects/`). These are the real numbers, not estimates.

| Day | Model calls | Uncached input | Cache write | Cache **read** | Output | Avg context per call | Largest context |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 09-06 | 762 | 1,520 | 4,582,323 | 228,045,162 | 1,322,289 | 305,287 | 499,824 |
| 09-07 | 541 | 1,080 | 1,909,998 | 160,275,730 | 575,678 | 299,791 | 469,489 |
| 09-08 | 993 | 1,978 | 2,728,690 | 317,184,563 | 859,152 | 322,170 | 626,631 |
| **09-09** | **1,365** | 2,718 | **5,387,115** | **798,867,754** | 1,677,549 | **589,200** | **966,836** |
| **09-10** | 179 | 354 | **2,446,504** | **120,100,136** | 150,908 | **684,620** | 828,106 |

Three sessions exist in total. One of them accounts for almost everything:

```
fe049c7e-….jsonl   66 MB   3,471 calls   6 Sep 20:31 → 10 Sep 14:35   (still open)
bc819350-….jsonl   21 MB     365 calls   6 Sep 15:04 → 6 Sep 19:15
2a18f098-….jsonl   41 KB       2 calls
```

Tool activity in the long session: 2,007 tool calls — PowerShell 604, Edit 481,
Write 275, Bash 179, browser 254, Read 140, Grep 34, **Agent 0**. Tool results
returned 1,159,459 characters of text in total (about 290 K tokens) and only
one single result exceeded 20 K characters, so no individual command flooded
the context. What did enlarge it: **158 screenshots, 23.3 MB of base64, roughly
230 K tokens**, every one of which stays in the transcript and is therefore
re-read on every later call.

## 4. Context size on disk

| Path | Size | Files | In Claude's context? |
| --- | --- | --- | --- |
| `backend/node_modules` | 354.3 MB | 4,731 | No — gitignored, so the search tools skip it |
| `.git` | 96.9 MB | 225 | No |
| `frontend/assets/img` | 98.1 MB | 218 | Only if a file is opened by name |
| `Catagories/` | 97.8 MB | 216 | Only if opened by name |
| `backend/dist` | 1.7 MB | 227 | No — gitignored |
| `backend/src` | 1.1 MB | 129 | Yes, when read |
| `backend/prisma` | 0.1 MB | 20 | Yes — `schema.prisma` is large and was read often |

`.gitignore` already covers `node_modules/`, `dist/`, `.env*`, logs, `*.bak`,
`uploads/`, `uploads-private/` and `ADMIN-LOGIN.local.txt`. Nothing large is
being pulled in automatically. The remaining exposure is the ~200 MB of product
and category photographs: one accidental image read costs about 1,400 tokens and
then rides along in every subsequent call of that session.

## 5. API usage in the project

Reported without values, as asked.

| Variable | Present | Referenced by code | Note |
| --- | --- | --- | --- |
| `AI_API_KEY` | yes, full length | `src/ai/index.ts:20` → `src/ai/providers/anthropic.ts:88` | the key the website spends |
| `ANTHROPIC_API_KEY` | yes, but short — looks like a stub | **not referenced by any source file** | was blank in `.env.example`; **not** exported into the shell. **Both lines have since been removed** — see §7. |

Settings in force: `AI_ENABLED=true`, `AI_MODEL=claude-sonnet-5`,
`AI_MAX_TOKENS=1024`, `AI_MAX_TOOL_ITERATIONS=6`,
`AI_MAX_MESSAGES_PER_CONVERSATION=40`, `RATE_LIMIT_AI_MAX=20` per 15 minutes.
The system prompt is sent with `cache_control: ephemeral`, so the fixed part of
each request is already a cache read rather than fresh input. The model is
tool-gated and cannot compose SQL. No key is printed, logged or committed.

The single finding worth acting on:

> **`npm test` spends real API tokens, and nothing says so.**
> `tests/run.mjs` auto-discovers every `*.test.mjs` in the folder, and
> `tests/ai-scenarios.test.mjs:66` POSTs to `/api/ai/chat` — a live model call.
> One run is about 12 conversation turns, each of which may take up to 6 tool
> iterations: **up to roughly 72 model calls per `npm test`**, several thousand
> input tokens each.

The transcript shows this being exercised heavily while the AI agent was being
built and corrected: **21 scenario-suite runs, 22 direct `/api/ai/chat`
exercises and 16 copilot exercises on 9 September alone**, plus 17 more on
8 September. At a few hundred thousand input tokens per full suite run, that
lands squarely on the order of the 1.3 M you were shown.

## 6. Ranked causes

### #1 — The AI test suite, run repeatedly on 9 September · **HIGH**

`tests/ai-scenarios.test.mjs`, reached automatically by `npm test`. 21 runs
recorded on 9 September, plus 38 individual chat and copilot exercises. Each run
is up to ~72 model calls against `AI_API_KEY`, and each call carries the system
prompt, the tool schemas and the conversation so far. This is the only thing in
the project that spends your API credit, it is billed to the Anthropic console
rather than to a subscription, and the command that triggers it — `npm test` —
gives no hint that it costs money. **This is the best match for a 1.3 M figure
on the API dashboard.**

### #2 — One Claude Code session open since 6 September · **HIGH, for subscription usage**

`fe049c7e-….jsonl`: 66 MB, 3,471 model calls, never cleared. The average context
was 589 K tokens per call on 9 September and peaked at 966,836. Every tool call
— every `git status`, every one-line edit — re-reads that entire context, which
is why cache reads total **1.52 billion tokens** across the session. Cache reads
bill at a tenth of the input rate, but a usage dashboard still counts them as
input tokens. Nothing was wrong; the session simply kept 30 phases of an
enterprise build alive in one window.

### #3 — 158 screenshots left in that context · **MEDIUM**

Browser verification of the admin dashboard returned 23.3 MB of base64 images,
roughly 230 K tokens. An image is not re-sent, but it is re-*read* from cache on
every subsequent call in the session, so screenshots taken on day two were still
being paid for on day four. This is the largest avoidable single contributor to
the size of the context in #2.

Also present but **not** causes: the automation sweep (no model call), webhook
retries (no model call), the 60-second admin polls (browser only), `node_modules`
(excluded from search), and the unused `ANTHROPIC_API_KEY` stub (a stub, and not
exported).

## 7. Fixes

### Applied

All four, in the order they were approved:

1. **The AI scenario suite is gated** behind `RUN_AI_SCENARIOS=yes`
   (`6005291`). `npm test` no longer calls the model: with a key but no flag it
   skips the nine scenarios and prints the two commands that run them. No test
   was removed, and all three branches were exercised against a stub server so
   checking the gate itself cost nothing.
2. **`.claude/settings.json` denies `Read`** on ten paths — `node_modules`,
   `dist`, `.git`, the four photograph folders and the two upload directories
   (`c5673c7`). Only reading is denied, so the paths stay listable and
   referable. Migrations were left out: small, and occasionally read.
3. **`CLAUDE.md` records the two habits** that caused this, with the numbers
   attached, plus a section naming the two things that spend real money
   (`378b847`).
4. **`ANTHROPIC_API_KEY` is gone** from both `.env` and `.env.example`, along
   with the comments that documented it. Nothing read it; `dist/env.js` still
   loads with no missing variable, and the site is unaffected. `.env` is
   gitignored, so only the template change is committed.

This report was written before those four; the proposals below are kept as they
were written, since what was proposed and why is the useful record.

### What was proposed

1. **Gate the AI scenario suite** — about six lines at the top of
   `backend/tests/ai-scenarios.test.mjs`: skip unless `RUN_AI_SCENARIOS=yes` is
   set, and print a line saying why it skipped and that it costs API credit.
   `npm test` then stays free, and the paid suite runs when you mean it. Highest
   value change here.
2. **Add `.claude/settings.json`** with a `permissions.deny` list for
   `Read(./backend/node_modules/**)`, `Read(./backend/dist/**)`, `Read(./.git/**)`,
   `Read(./frontend/assets/img/**)`, `Read(./Catagories/**)`, `Read(./OUR FACTORY/**)`,
   `Read(./LOGO/**)` and `Read(./backend/uploads*/**)`. Purely additive, blocks
   nothing you use, and makes an accidental 200 MB image read impossible.
3. **Add a token-discipline note to `CLAUDE.md`** — one session per module,
   prefer reading the page over screenshotting it, and the AI suite costs money.
4. **Delete the unused `ANTHROPIC_API_KEY=` line from `.env`.** It is a stub, no
   source file reads it, and the Anthropic SDK picks that variable name up
   automatically — so an unused key-shaped variable there is a trap rather than a
   feature. Your `.env`, so your call.

### Deliberately not done

- Nothing deleted: no products, no images, no source, no uploads, no migrations.
- No key rotated, printed or moved.
- No change to `AI_MAX_TOKENS`, the rate limits or the tool caps. They are
  already conservative, and changing them changes how the website behaves for
  customers.
- `AUTOMATION_SWEEP_MINUTES` left at 15; it costs no tokens.

## 8. How to keep this from happening again

**Working with Claude Code**

- One session per module, and `/clear` between them. A session's cost grows with
  the square of its length: every new turn pays to re-read every old turn. The
  four-day session above is the whole of finding #2.
- `/compact` when a session must continue — it replaces the transcript with a
  summary and resets the per-call cost.
- Ask for verification by reading the page rather than by screenshot, unless the
  question is genuinely visual — colour, spacing, layout. Text is roughly ten
  times cheaper and stays useful for longer.
- Say what you want changed, not "look at everything". Broad instructions cost
  broad reads.
- The token-saving rules already in this repo's `CLAUDE.md` are the right ones,
  and they were followed: tool results averaged 578 characters, and only one
  exceeded 20 K.

**Working on the website's own AI**

- Run `npm test` freely once fix 1 is in. Run `RUN_AI_SCENARIOS=yes npm test`
  when you actually want to check the agent's behaviour, and read the output
  before running it again.
- The admin copilot spends the same key. It is a business tool, not a chat
  window; each question costs.
- For a ceiling that cannot be forgotten, set a monthly spend limit on the key
  in the Anthropic console.

**Telling the two bills apart**

Claude Code on a subscription and the website's `AI_API_KEY` are billed
separately. Usage that appears in the Anthropic **console** against a specific
API key is the website — finding #1. Usage shown against your Claude
subscription is Claude Code — finding #2. Checking which of the two showed
1.3 M will say immediately which cause to act on first.

---

## TOKEN USAGE RISK: MEDIUM

Nothing hostile, nothing recursive, nothing hidden. But one command (`npm test`)
spends money without saying so, and one habit (a session left open for four
days) multiplies every later call by the whole history. Both are addressed by
the first two changes in §7.
