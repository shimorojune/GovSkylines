// stdio entry: for the cabinet orchestrator, Claude Code and Claude Desktop.
// Nothing listens on the network in this mode.
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { app } from "./server.js";

await app.connect(new StdioServerTransport());
