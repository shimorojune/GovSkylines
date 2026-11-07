import Anthropic from "@anthropic-ai/sdk";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Department } from "./departments.js";
import { logEvent } from "./log.js";

type McpTool = Awaited<ReturnType<Client["listTools"]>>["tools"][number];
type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type Approver = (dept: Department, tool: string, input: Record<string, unknown>) => Promise<boolean>;

const anthropic = new Anthropic();
const MODEL = process.env.CABINET_MODEL ?? "claude-opus-5-5";
const EFFORT = (process.env.CABINET_EFFORT ?? "medium") as Effort;
const MAX_TURNS = 12;

/** Converts MCP tool content into Anthropic tool_result content (text + images). */
function toResultContent(
  content: unknown,
): Array<Anthropic.Beta.BetaTextBlockParam | Anthropic.Beta.BetaImageBlockParam> {
  const items = Array.isArray(content) ? content : [];
  const out: Array<Anthropic.Beta.BetaTextBlockParam | Anthropic.Beta.BetaImageBlockParam> = [];
  for (const item of items as Array<Record<string, unknown>>) {
    if (item.type === "text" && typeof item.text === "string") {
      out.push({ type: "text", text: item.text });
    } else if (item.type === "image" && typeof item.data === "string" && typeof item.mimeType === "string") {
      out.push({
        type: "image",
        source: { type: "base64", media_type: item.mimeType as "image/png", data: item.data },
      });
    }
  }
  return out.length ? out : [{ type: "text", text: "(no content)" }];
}

/**
 * Runs one department on one task: a manual tool loop where the department only
 * sees its own tools, and write tools go through guards and the mayor's approval.
 */
export async function runDepartment(
  mcp: Client,
  allTools: McpTool[],
  dept: Department,
  task: string,
  approve: Approver,
): Promise<string> {
  const allowed = new Set([...dept.readTools, ...dept.writeTools]);
  const writes = new Set(dept.writeTools);

  const missing = [...allowed].filter((n) => !allTools.some((t) => t.name === n));
  if (missing.length) console.warn(`[${dept.id}] tools not offered by the MCP server yet: ${missing.join(", ")}`);

  const tools: Anthropic.Beta.BetaTool[] = allTools
    .filter((t) => allowed.has(t.name))
    .map((t) => ({
      name: t.name,
      description: t.description ?? "",
      // Drop the JSON Schema "$schema" marker the MCP SDK adds; the API doesn't need it.
      input_schema: (({ $schema: _ignored, ...rest }) => rest)(
        t.inputSchema as Record<string, unknown>,
      ) as Anthropic.Beta.BetaTool.InputSchema,
    }));
  // Cache the stable prefix (tools + system prompt) across turns.
  if (tools.length) tools[tools.length - 1].cache_control = { type: "ephemeral" };

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: task }];
  await logEvent({ dept: dept.id, kind: "task", task });

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT },
      // Route to a fallback model if a safety classifier declines the request.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: `${dept.name}\n\n${dept.mandate}` }],
      tools,
      messages,
    });

    if (response.stop_reason === "refusal") {
      await logEvent({ dept: dept.id, kind: "refusal", details: response.stop_details });
      return `[${dept.name}] request was declined by the model (refusal).`;
    }

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "pause_turn") continue;

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      await logEvent({ dept: dept.id, kind: "briefing", text });
      return text;
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of toolUses) {
      const input = (call.input ?? {}) as Record<string, unknown>;
      const reject = (text: string) => results.push({ type: "tool_result", tool_use_id: call.id, content: text, is_error: true });

      // 1. Power check: enforced in code, regardless of what the model asked for.
      if (!allowed.has(call.name)) {
        await logEvent({ dept: dept.id, kind: "denied", tool: call.name, input, reason: "outside mandate" });
        reject(`Denied: ${call.name} is outside the ${dept.name}'s powers.`);
        continue;
      }

      if (writes.has(call.name)) {
        // 2. Hard limits.
        const guard = dept.guards?.[call.name]?.(input);
        if (guard && !guard.ok) {
          await logEvent({ dept: dept.id, kind: "denied", tool: call.name, input, reason: guard.reason });
          reject(`Denied by limit: ${guard.reason}`);
          continue;
        }
        // 3. Mayor's approval.
        if (!(await approve(dept, call.name, input))) {
          await logEvent({ dept: dept.id, kind: "declined", tool: call.name, input });
          results.push({ type: "tool_result", tool_use_id: call.id, content: "The Mayor declined this action." });
          continue;
        }
      }

      try {
        const res = await mcp.callTool({ name: call.name, arguments: input });
        await logEvent({ dept: dept.id, kind: writes.has(call.name) ? "action" : "read", tool: call.name, input, isError: res.isError ?? false });
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: toResultContent(res.content),
          is_error: Boolean(res.isError),
        });
      } catch (err) {
        await logEvent({ dept: dept.id, kind: "error", tool: call.name, input, error: String(err) });
        reject(`Tool call failed: ${String(err)}`);
      }
    }
    messages.push({ role: "user", content: results });
  }

  return `[${dept.name}] stopped after ${MAX_TURNS} turns without finishing.`;
}
