# GovSkylines: quickest path to an AI-run city government in Cities: Skylines II

_Written 2026-11-07. Everything about third-party projects below was checked on that date and should be re-checked before you depend on it._

## TL;DR

**Don't write the game mod first. It already exists.**

[CS2MCP by LancerComet](https://github.com/LancerComet/cities-skylines-2-mcp) (Apache-2.0) is the exact plumbing you described:

- a **C# bridge mod** that runs inside the game and serves HTTP on `127.0.0.1:8642`. It queues requests onto the simulation main thread through an ECS system, and it builds things through the game's own tool and validation pipeline.
- a **TypeScript MCP server** (Node 18+, stdio) that wraps that HTTP API as about 65 tools: 38 read and 27 write.

The write tools already cover taxes, service budgets, fees, loans, policies, districts, zoning, placing buildings, building and upgrading roads, junction control, transit stops and lines, demolition, and simulation speed.

So the quickest path is to **install CS2MCP, then build only the part that is actually yours: the government.** That means departments with scoped powers, a cabinet loop, the mayor's approvals, and later an in-game UI. That layer is where the product is. The bridge is commodity plumbing that you fork when you need to.

The scaffold in [`cabinet/`](cabinet/) is that government layer, at milestone 1.

## The honest caveats on building on CS2MCP

- **It's young and run by one person.** It has about 45 stars and 12 commits. Expect to fork it.
- **Game patches can break it.** It ports code from LineTool-CS2 and includes portions derived from decompiled game code. When Paradox ships an update, the construction paths are the most likely to break.
- **It's Windows only, and needs the Steam build, .NET 8 SDK and Node 18+.**
- **Distribution is an open question.** I have not verified whether Paradox Mods accepts a mod that opens a localhost HTTP server. For now, plan on local installs, which the toolchain supports: the build drops the mod into `%LOCALAPPDATA%Low\Colossal Order\Cities Skylines II\Mods\`.

If you ever need to own the bridge, the official toolchain is set up from the game's **Options > Modding** screen. It silently installs Unity 2022.3.7f1, .NET 8 and Node 20, and gives you a `dotnet new` C# template and an `npx create-csii-ui-mod` UI template. Code mods are C# against Unity ECS (Entities 1.0.x): you write `GameSystemBase` systems registered in `IMod.OnLoad`. The in-game UI is **React + TypeScript**, which suits you. It hot-reloads with `--uiDeveloperMode`, and the UI debugger runs on `localhost:9444`.

## Decision (2026-11-07): we maintain our own MCP

Rohit wants to own the MCP for quality and long-term improvement. The recommended way to do that without losing weeks:

- **Fork the C# bridge (CS2MCP.Bridge) and take it over.** Its hard-won parts are the main-thread request queue and construction through the game's `ToolBaseSystem` and validation pipeline. Rewriting those from scratch is the slowest part of the whole project. Apache-2.0 allows the fork: keep the LICENSE and NOTICE and credit the original. Note that some of its code derives from decompiled game code under the Paradox user agreement.
- **Write our own TypeScript MCP server from scratch** against the bridge's HTTP API. That layer is thin and is in Rohit's stack, so owning it outright is cheap. It's also where the product-specific value goes:
  - **department-scoped tool sets**, so powers are enforced at the MCP layer and not only in the orchestrator
  - **compact, LLM-shaped responses** instead of raw bridge JSON, which cuts token cost
  - **higher-level tools** (grid extension, A-to-B connection, transit coverage) for M4
  - **contract tests** against a mock bridge, so game patches show up as failing tests and not as confused agents
- Keep the bridge's HTTP API as the contract between the two halves at first. Change it deliberately later.

**Update, same day:** the decision is made (fork the bridge, write our own server), and the server is built on
**[Skybridge](https://github.com/alpic-ai/skybridge)** (v2.1, a TypeScript framework for MCP servers and MCP Apps,
on MCP SDK v2 and Express 5). In this repo that's `bridge/` (vendored fork, see `bridge/UPSTREAM.md`),
`mcp-server/` (Skybridge) and `cabinet/`.

What Skybridge gets us, and what to watch:
- **Typed tools and React views.** Its main feature is views: React UIs a tool can render inside Claude or
  ChatGPT. That gives us a cheaper M3: cabinet briefings with Approve/Reject buttons inside the chat client,
  before (or instead of) building an in-game panel.
- **HTTP-first.** It serves Streamable HTTP on `/mcp` and listens on **all interfaces** on port 3000. Because
  these tools can change your city, we add a loopback-only guard. stdio works through `app.connect()`, and
  that's what the cabinet and Claude Code use.
- **Telemetry is on by default**: PostHog for the CLI, plus a UDP metric on every tool call. The server
  disables the per-call metric itself, and you can disable the CLI's with `npx skybridge telemetry disable`.
- **It needs Node 24 or newer**, so check your Windows box.
- **The handler runs for every request.** Keep it to registration; one-time setup like the bridge client goes in `setup`.

## What's easy and what's hard

| Area | Reality |
|---|---|
| **Reading state**: population, happiness, money, budget (14 income and 15 expense lines), demand, services, labor, traffic, notifications, zoning, road graph | **Easy and reliable.** This is where the agents get their briefings. |
| **Money levers**: taxes for the 4 zone classes (clamped to game limits), service budgets (50–150%), fees, loans, policies, districts | **Easy.** These are single calls whose results you can check. Revenue, Finance and Services can be fully real from day one. |
| **Zoning and placing service buildings** | **Medium.** The API works, but the agent has to pick valid, road-adjacent spots. |
| **Transit**: bus and tram stops at the roadside, lines through stops | **Medium.** Lines only get vehicles if a depot of that type exists and the simulation is running. Train and metro stops are station buildings that need track. |
| **Road planning** | **Hard, and the API isn't the problem.** `cs2_build_road` exists. LLMs are bad at spatial planning. When AI mayors were given a Micropolis/SimCity API ([Hallucinating Splines](https://dunn.us/notes/the-splines-are-hallucinating)), they scattered buildings, forgot connectivity and power, and about 25% of the cities went bankrupt from over-building. The fix there was higher-level tools (batch operations, auto-connect with pathfinding) and very explicit rules. Plan for the same. |
| **Terraforming** | Not implemented in CS2MCP. |

**What this means for the product:** ship the departments that work on numbers first. Transport and Urban Planning should work through **higher-level tools you write**, such as "extend the grid in district X by N blocks" or "connect A to B with an arterial". Never give them raw segment placement. Those tools are the research-heavy part of the project. Treat them as milestone 4, not milestone 1.

## Architecture

```
You (Mayor)
   │  directives, approvals
   ▼
Cabinet orchestrator (TypeScript, Node)              ← this repo, the product
   ├─ Dept. of Revenue    ─┐  each one: system prompt (mandate)
   ├─ Dept. of Services    │  + an allowlist of MCP tools
   ├─ Dept. of Transport   │  + guards enforced in CODE, not in the prompt
   └─ …                   ─┘  + the mayor's approval for write tools
   │  MCP client (stdio)
   ▼
mcp-server/ (ours, Skybridge, TypeScript)   →  HTTP 127.0.0.1:8642  →  bridge/ (C# mod in-game, CS2MCP fork)
```

**Why one orchestrator, instead of each department being its own Claude Code or Claude Desktop session pointed at the MCP server:**

1. **Powers have to be enforced in code.** If the Revenue department can see `cs2_build_road`, it will eventually call it. The orchestrator only exposes each department's allowlisted tools to it, and it rejects anything else even if the model asks for it.
2. **Approvals and limits need one gate.** Examples are "no tax change bigger than 2 points per cycle" and "Transport can't spend more than ₡X without Finance".
3. **You need a shared record.** That means cabinet minutes, and a record of who did what and why, which also gives the mayor something to read.
4. **Cost control.** You decide how often each department runs, and on which model.

### The government loop (turn-based on purpose)

1. **Pause** the simulation with `cs2_set_simulation`.
2. **Briefing:** each department reads its slice of the city (read tools only).
3. **Proposals:** each department proposes actions with a reason, and Finance can veto spending.
4. **The mayor approves or rejects**, or actions inside pre-set limits get auto-approved.
5. **Execute,** then re-read to verify.
6. **Run N in-game days** with `cs2_run_simulation`, then repeat.

Turn-based keeps agents from acting on stale state, keeps tokens bounded, and makes "being the mayor" an actual role: you review a cabinet meeting instead of micromanaging. Real-time is a later option.

### Starting set of departments

| Department | Reads | Writes (each needs approval at first) |
|---|---|---|
| Revenue | taxes, budget, demand, overview | `cs2_set_tax` |
| Finance / Treasury | budget, loan, service budgets | `cs2_set_loan`, plus a veto over other departments' spending |
| Public Services (health, education, safety) | city services, service budgets, notifications | `cs2_set_service_budget`, `cs2_set_policy` |
| Transport | traffic, transit lines and stops, road graph | lines, stops, line vehicles (M2), road tools only through your higher-level tools (M4) |
| Urban Planning | zoning, demand, gridmap, districts | `cs2_zone_area`, `cs2_create_district` (M3+) |

## Milestones

**M0: prove the pipe (an evening).**
1. Install CS2MCP and build both halves. Its README has the steps.
2. Load a save, then use the tools from plain Claude Code: `cs2_ping`, `cs2_city_overview`, `cs2_get_taxes`, and `cs2_set_tax` on a throwaway save.
3. Run `npm run tools` in `cabinet/` to dump the real input schemas. You'll need them for guards.

**M1: one department, end to end (a weekend). This is what the scaffold does.**
The Revenue department reads the budget and taxes, proposes a change with a reason, you approve it in the terminal, `cs2_set_tax` runs, and the department re-reads to confirm. Everything is logged to `minutes/cabinet-log.jsonl`.

**M2: a cabinet.**
1. Add Finance, Services, and read-only Transport.
2. Add a `cabinet` command that runs the turn-based loop above over every department, plus a "Chief of Staff" step that merges the proposals and flags conflicts.
3. Add argument guards, such as tax deltas and budget caps, once you know the real schemas.

**M3: the mayor never leaves the game.**
Add an in-game panel (a CS2 UI mod in React/TS) that shows department briefings and has Approve and Reject buttons. This means forking the bridge to add an approval-queue endpoint the panel can read and write. The orchestrator then waits on that queue instead of the terminal.

**M4: departments that build things.**
Give Transport and Planning higher-level, deterministic tools (grid extension, A-to-B connections, "add a bus line covering district X"), implemented in the forked bridge or in the orchestrator on top of the raw tools. Screenshots (`cs2_screenshot`) can give the planner a view, but they're slow and token-heavy, so use them for checking results, not as the main input.

## Cost and models

Each department turn sends its tool results (JSON city data) to the model. Briefings can be tens of thousands of input tokens. To keep that bounded:

- keep briefings compact (trim the bridge's JSON before passing it on)
- use prompt caching for the fixed department prompts and tool lists
- run routine departments less often
- set the model per department (`CABINET_MODEL`, which defaults to Claude Opus 5.5). Cheaper models for routine reporting are a later cost lever, and you should measure before you switch.

## What I need from you to go further

1. Confirm you're on a **Windows PC with the Steam version of CS2**. CS2MCP requires both.
2. Have an **Anthropic API key** for the cabinet.
3. If you want this in git, **create an empty GitHub repo** and tell me its name. I can't create repos from here, but I can push the scaffold and plan into it once it exists.

## Sources

- CS2MCP: https://github.com/LancerComet/cities-skylines-2-mcp
- Official modding toolchain: https://cs2.paradoxwikis.com/Modding_Toolchain (and https://cs2.paradoxwikis.com/Modding)
- Community modding guide (decompiled API reference): https://ps1ke.github.io/Cities-Skylines-2-Modding-Guide
- Lessons from AI mayors in Micropolis: https://dunn.us/notes/the-splines-are-hallucinating
- cities2-mcp (a different project: helps you *write* CS2 mods, doesn't control the game): https://pypi.org/project/cities2-mcp
