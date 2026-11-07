import { z } from "zod";
import type { McpServer } from "skybridge/server";
import { Bridge, BridgeError } from "./bridge.js";

/**
 * Tool results: JSON text for the model, plus structuredContent so typed
 * clients (and future Skybridge views) get the object directly.
 * Errors come back as tool errors (isError) the model can read, never as throws.
 */
async function run(fn: () => Promise<unknown>) {
  try {
    const data = (await fn()) as Record<string, unknown>;
    return { content: JSON.stringify(data), structuredContent: data };
  } catch (err) {
    const message = err instanceof BridgeError ? err.message : `Unexpected error: ${String(err)}`;
    return { content: message, isError: true };
  }
}

const TAX_AREAS = ["Residential", "Commercial", "Industrial", "Office"] as const;

/**
 * Milestone-1 surface: city state, finance levers, simulation clock.
 * Names keep the cs2_ prefix so they stay compatible with the cabinet's departments.
 */
export function registerTools(server: McpServer, bridge: Bridge) {
  return server
    .registerTool(
      {
        name: "cs2_ping",
        description:
          "Check that Cities: Skylines II is running with the bridge mod loaded. Returns mod version and game mode. " +
          "Works while a save is loading; call this first to diagnose connection problems.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
      },
      () => run(() => bridge.call("/ping", {}, 3_000)),
    )
    .registerTool(
      {
        name: "cs2_game_state",
        description: "Game mode, whether a city is loaded, city name, simulation pause/speed and the in-game date.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
      },
      () => run(() => bridge.call("/state")),
    )
    .registerTool(
      {
        name: "cs2_city_overview",
        description: "Population, happiness, health, treasury money, XP, in-game date and simulation speed.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
      },
      () => run(() => bridge.call("/city/overview")),
    )
    .registerTool(
      {
        name: "cs2_demand",
        description:
          "Residential, commercial, industrial, office and storage demand (0-100) with the factors that explain it " +
          "(e.g. Taxes, Unemployment, EmptyZones). Positive factors push demand up, negative push it down.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
      },
      () => run(() => bridge.call("/city/demand")),
    )
    .registerTool(
      {
        name: "cs2_budget",
        description:
          "City budget: total income, expenses, balance and a per-source breakdown (taxes by zone, fees, service " +
          "upkeep, loan interest, trade). Values are monthly; expenses are positive costs.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
      },
      () => run(() => bridge.call("/city/budget")),
    )
    .registerTool(
      {
        name: "cs2_get_taxes",
        description: "Current tax rate and allowed range for Residential, Commercial, Industrial and Office.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
      },
      () => run(() => bridge.call("/city/taxes")),
    )
    .registerTool(
      {
        name: "cs2_set_tax",
        description:
          "Set the tax rate (integer percent) for one tax area. Clamped to the game's allowed range (see response). " +
          "Higher taxes raise income but lower demand and happiness.",
        inputSchema: {
          area: z.enum(TAX_AREAS).describe("Tax area to change"),
          rate: z.number().int().describe("New tax rate in percent"),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      },
      ({ area, rate }) => run(() => bridge.call("/city/taxes/set", { area, rate })),
    )
    .registerTool(
      {
        name: "cs2_service_budgets",
        description:
          "Per-service budget sliders (50-150%, 100 = default) with efficiency, estimated upkeep and building count.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
      },
      () => run(() => bridge.call("/city/service-budgets")),
    )
    .registerTool(
      {
        name: "cs2_set_service_budget",
        description:
          "Set one city service's budget percentage (50-150) by name from cs2_service_budgets. Lower saves money " +
          "but reduces efficiency.",
        inputSchema: {
          service: z.string().describe("Service name from cs2_service_budgets"),
          percentage: z.number().int().min(50).max(150).describe("Budget percentage, 100 = default"),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      },
      ({ service, percentage }) => run(() => bridge.call("/city/service-budgets/set", { service, percentage })),
    )
    .registerTool(
      {
        name: "cs2_set_simulation",
        description:
          "Pause/unpause the simulation and/or set its speed (0 = paused, 1 = normal, 2, 4; up to 8 accepted).",
        inputSchema: {
          paused: z.boolean().optional().describe("true to pause, false to resume"),
          speed: z.number().min(0).max(8).optional().describe("Simulation speed multiplier"),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      },
      ({ paused, speed }) =>
        paused === undefined && speed === undefined
          ? Promise.resolve({ content: "Provide at least one of: paused, speed.", isError: true })
          : run(() => bridge.call("/sim/control", { paused, speed })),
    )
    .registerTool(
      {
        name: "cs2_run_simulation",
        description:
          "Run the simulation for N in-game hours, then auto-pause. Returns immediately; poll cs2_game_state to " +
          "track progress. cancel=true stops early. This is the 'end of turn' step of the cabinet loop.",
        inputSchema: {
          hours: z.number().min(0.1).max(96).optional().describe("In-game hours to run (required unless cancel)"),
          speed: z.number().min(0.5).max(8).optional().describe("Speed while running (default 4)"),
          cancel: z.boolean().optional().describe("true to cancel a timed run and pause now"),
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      ({ hours, speed, cancel }) =>
        !cancel && hours === undefined
          ? Promise.resolve({ content: "Provide hours, or cancel=true.", isError: true })
          : run(() => bridge.call("/sim/run", { hours, speed, cancel: cancel || undefined })),
    );
}
