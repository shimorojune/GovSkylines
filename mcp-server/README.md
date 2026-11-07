# GovSkylines MCP server

Our MCP server, built on [Skybridge](https://github.com/alpic-ai/skybridge). It turns the in-game bridge's
HTTP API (`../bridge`, `127.0.0.1:8642`) into typed MCP tools for the cabinet and for any MCP client
(Claude Code, Claude Desktop, ChatGPT).

## Run

| Mode | Command | Use it for |
|---|---|---|
| stdio | `npm run stdio` | The cabinet, Claude Code, Claude Desktop. Nothing listens on the network. |
| HTTP dev | `npm run dev` | Skybridge devtools and emulator with hot reload, at `http://localhost:3000/mcp` |
| HTTP prod | `npm run build && npm start` | Streamable HTTP on `/mcp`, port 3000 |

In HTTP mode the server **only answers loopback connections** (`src/loopback.ts`), because Skybridge listens
on every interface and these tools can change your city. `GOVSKYLINES_ALLOW_REMOTE=true` turns that off; don't.

Claude Code (from the repo root):

```bash
claude mcp add govskylines -e SKYBRIDGE_TELEMETRY_DISABLED=1 -- npx --prefix mcp-server tsx mcp-server/src/stdio.ts
```

## Environment

| Variable | Default | |
|---|---|---|
| `CS2_BRIDGE_URL` | `http://127.0.0.1:8642` | Must match the bridge's `CS2MCP_PORT` |
| `CS2MCP_TOKEN` | unset | Shared secret, if you set one on the bridge |
| `SKYBRIDGE_TELEMETRY_DISABLED` | unset | Set to `1`; Skybridge telemetry is on by default |

## Tools

| Tool | Bridge route | Kind |
|---|---|---|
| `cs2_ping` | `GET /ping` | read |
| `cs2_game_state` | `GET /state` | read |
| `cs2_city_overview` | `GET /city/overview` | read |
| `cs2_demand` | `GET /city/demand` | read |
| `cs2_budget` | `GET /city/budget` | read |
| `cs2_get_taxes` | `GET /city/taxes` | read |
| `cs2_set_tax` | `POST /city/taxes/set` | write |
| `cs2_service_budgets` | `GET /city/service-budgets` | read |
| `cs2_set_service_budget` | `POST /city/service-budgets/set` | write |
| `cs2_set_simulation` | `POST /sim/control` | write |
| `cs2_run_simulation` | `POST /sim/run` | write |

Every tool returns JSON text plus `structuredContent`, carries MCP read-only/write annotations, and reports
bridge failures as readable tool errors (for example "No city is loaded") instead of throwing.

The bridge has about 50 more routes (traffic, zoning, roads, transit, placement). We port them a group at a
time, each with contract tests, rather than copying the upstream server wholesale.

## Tests

`npm test` runs the MCP tools against a mock bridge over an in-memory transport. It checks routes, HTTP
methods (the bridge only accepts POST for mutating routes), query encoding (`%20`, not `+`), schema rejection
before the bridge is called, and error mapping. No game needed.

## Next

- **Department-scoped tool sets** at the MCP layer, so a Revenue client can't even list `cs2_build_road`.
- **Compact responses** that trim the bridge's JSON before it reaches the model.
- **Skybridge views**: cabinet briefings with Approve/Reject buttons, rendered inside Claude or ChatGPT.
