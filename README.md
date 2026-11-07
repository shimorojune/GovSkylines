# GovSkylines

A city government of AI departments for **Cities: Skylines II**. You play the Mayor: you set direction and
approve decisions, while departments like Revenue, Public Services and Transport read the city and act on it,
each inside the powers it's been given.

```
Mayor (you) ─▶ cabinet/      AI departments: mandates, tool allowlists, guards, approvals
                 │ MCP (stdio or HTTP)
                 ▼
               mcp-server/   our MCP server, built on Skybridge (TypeScript)
                 │ HTTP 127.0.0.1:8642
                 ▼
               bridge/       C# mod running inside the game (fork of CS2MCP.Bridge)
```

| Folder | What it is | Status |
|---|---|---|
| [`mcp-server/`](mcp-server/) | Skybridge MCP server exposing the bridge as typed tools | 11 tools (city state, taxes, service budgets, sim clock), contract tests |
| [`bridge/`](bridge/) | In-game C# bridge mod, forked from [CS2MCP](https://github.com/LancerComet/cities-skylines-2-mcp) (Apache-2.0) | Unmodified fork, see [`bridge/UPSTREAM.md`](bridge/UPSTREAM.md) |
| [`cabinet/`](cabinet/) | Department agents on the Claude API | Milestone 1: one department end to end, with the Mayor's approval |
| [`docs/PLAN.md`](docs/PLAN.md) | Architecture, what's easy and hard, milestones | |

## Quick start (Windows, Steam CS2)

Requires the .NET 8 SDK and **Node 24+** (Skybridge requires Node 24).

```powershell
# 1. Bridge mod: builds and deploys into the game's local Mods folder
dotnet build bridge\CS2MCP.Bridge.csproj

# 2. MCP server
cd mcp-server; npm install; npm test

# 3. Cabinet
cd ..\cabinet; npm install; copy .env.example .env   # add ANTHROPIC_API_KEY
```

Start the game, load a **throwaway** save, then:

```powershell
cd cabinet
npm run tools               # lists the MCP server's tools (proves game, bridge and server are connected)
npm run brief -- revenue    # Revenue briefing; any tax change asks for your approval first
```

## Telemetry

Skybridge sends usage telemetry by default: CLI events to PostHog, and a UDP metric on every tool call.
The server turns off the per-call metric itself (`mcp-server/src/server.ts`). For the CLI, run
`npx skybridge telemetry disable` once, or set `SKYBRIDGE_TELEMETRY_DISABLED=1` in your shell.
