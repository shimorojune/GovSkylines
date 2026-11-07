# GovSkylines Cabinet (milestone 1)

AI government departments for Cities: Skylines II. Each department is a Claude agent with a mandate,
an allowlist of game tools, and code-enforced limits. Write actions go to you, the Mayor, for approval.

It talks to our MCP server in `../mcp-server` over stdio, which talks to the in-game bridge mod in `../bridge`.
See `../docs/PLAN.md` for the design.

## Setup (Windows, Steam CS2)

1. Build the bridge mod and install the MCP server's dependencies (see the root README).
2. In this folder: `npm install`, `copy .env.example .env`, then fill in `ANTHROPIC_API_KEY`.
3. Start the game and load a save. **Use a throwaway copy at first.**

## Use

```bash
npm run tools                                   # list the MCP server's tools + input schemas (do this first)
npm run brief -- revenue                        # Revenue briefing; may propose a tax change for approval
npm run ask -- services "Health coverage complaints are up. Fix it within budget."
npm run brief -- transport                      # read-only; its traffic/transit tools aren't ported yet
```

Every read, action, denial and briefing is appended to `minutes/cabinet-log.jsonl`.

## How powers are enforced

- `src/departments.ts` defines each department: `readTools`, `writeTools`, `mandate`, optional `guards`.
- The model is only *shown* its own tools, and `src/department-agent.ts` also rejects any call outside
  that list, so a confused or prompt-injected department can't reach other powers.
- Write tools go through `guards` (hard limits in code), then the Mayor's approval (`AUTO_APPROVE=false`).

## Next steps (M2)

- Add the per-turn tax delta guard (needs the current rate) and a `cs2_set_service_budget` guard.
- Add a `cabinet` command: pause, brief all departments, merge proposals, approve, execute, run N days, repeat.
- Add a Finance department with a veto on other departments' spending.

Status: typechecks, and `npm run tools` works end to end against the real MCP server with a mock bridge.
It has **not** been run against the real game or the live API yet.
