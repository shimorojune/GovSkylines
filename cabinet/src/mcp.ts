import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Spawns the GovSkylines MCP server (../mcp-server) over stdio and connects to it.
 * Set GOVSKYLINES_MCP_DIR to point somewhere else.
 */
export async function connectCs2(): Promise<Client> {
  const serverDir = resolve(process.env.GOVSKYLINES_MCP_DIR ?? resolve(here, "../../mcp-server"));

  const env: Record<string, string> = { SKYBRIDGE_TELEMETRY_DISABLED: "1" };
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/stdio.ts"],
    cwd: serverDir,
    env,
  });
  const client = new Client({ name: "govskylines-cabinet", version: "0.1.0" });
  await client.connect(transport);
  return client;
}
