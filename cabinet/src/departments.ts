/**
 * A department's powers are defined HERE, in code. The model only ever sees the
 * tools listed for it, and the orchestrator refuses any other call.
 *
 * Tool names come from ../mcp-server. Run `npm run tools` to see the live list and
 * input schemas before adding guards.
 */

export interface ToolGuardResult {
  ok: boolean;
  reason?: string;
}

export interface Department {
  id: string;
  name: string;
  mandate: string;
  /** Read-only tools: run without approval. */
  readTools: string[];
  /** State-changing tools: need the mayor's approval unless AUTO_APPROVE=true. */
  writeTools: string[];
  /**
   * Hard limits checked in code before a write tool runs, whatever the model says.
   * Fill these in once you know the real argument shapes (see `npm run tools`).
   */
  guards?: Record<string, (input: Record<string, unknown>) => ToolGuardResult>;
}

const SHARED_RULES = `
You are a department of the city government of a Cities: Skylines II city. The player is the Mayor.
Rules:
- Read the current state with your tools before proposing anything. Never guess numbers.
- You may only act inside your mandate. If something outside it needs doing, say which department should handle it.
- Before any state-changing call, state in one or two sentences what you are changing, from what to what, and why.
- Make small, reversible changes. One lever at a time, then re-read to verify the effect.
- The Mayor may decline an action. If declined, do not retry it in this turn; report back instead.
- End with a short briefing for the Mayor: the situation, what you did, and what you recommend next.
`.trim();

export const departments: Department[] = [
  {
    id: "revenue",
    name: "Department of Revenue",
    mandate: `${SHARED_RULES}

Your mandate: tax policy. Keep the city's income healthy without killing demand.
Taxes too high suppress zone demand and happiness; too low starve the budget.
Change any one tax rate by at most 2 percentage points per turn.`,
    readTools: ["cs2_city_overview", "cs2_budget", "cs2_get_taxes", "cs2_demand", "cs2_game_state"],
    writeTools: ["cs2_set_tax"],
    guards: {
      // Placeholder policy band (tune it): enforced whatever the model argues. The per-turn
      // 2-point delta needs the current rate; that check lands with the cabinet loop.
      cs2_set_tax: (input) => {
        const rate = Number(input.rate);
        if (!Number.isInteger(rate)) return { ok: false, reason: "rate must be an integer percent" };
        if (rate < 0 || rate > 25) return { ok: false, reason: `rate ${rate}% is outside the cabinet's 0-25% band` };
        return { ok: true };
      },
    },
  },
  {
    id: "services",
    name: "Department of Public Services",
    mandate: `${SHARED_RULES}

Your mandate: health, education, safety, and other city services. Read service coverage and notifications,
and adjust per-service budgets (50-150%) where coverage is failing. Spending is limited by the budget:
check it before increasing anything.`,
    readTools: ["cs2_city_overview", "cs2_city_services", "cs2_service_budgets", "cs2_budget", "cs2_notifications"],
    writeTools: ["cs2_set_service_budget"],
  },
  {
    id: "transport",
    name: "Department of Transport",
    mandate: `${SHARED_RULES}

Your mandate: traffic and public transit. For now you are READ-ONLY: diagnose congestion and transit gaps
and recommend concrete fixes to the Mayor. You cannot build yet.
(Traffic and transit tools are not ported to the GovSkylines MCP server yet; until they are, work from the city overview.)`,
    readTools: ["cs2_city_overview", "cs2_traffic", "cs2_list_transit_lines", "cs2_list_transit_stops", "cs2_road_graph"],
    writeTools: [],
  },
];

export function getDepartment(id: string): Department {
  const d = departments.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown department "${id}". Known: ${departments.map((x) => x.id).join(", ")}`);
  return d;
}
