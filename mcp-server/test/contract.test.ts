/**
 * Contract tests: the MCP tools against a mock of the in-game bridge.
 * They pin down the HTTP contract (routes, methods, query encoding, error
 * handling) so a change on either side shows up here, not as a confused agent.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

interface Hit {
  method: string;
  path: string;
  query: Record<string, string>;
  rawQuery: string;
}

const hits: Hit[] = [];
let respond: (hit: Hit) => { status: number; body: unknown } = () => ({ status: 200, body: {} });

const mock = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://mock");
  const hit: Hit = {
    method: req.method ?? "",
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    rawQuery: url.search,
  };
  hits.push(hit);
  const { status, body } = respond(hit);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
});

let client: Client;

before(async () => {
  await new Promise<void>((r) => mock.listen(0, "127.0.0.1", r));
  process.env.CS2_BRIDGE_URL = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
  process.env.SKYBRIDGE_TELEMETRY_DISABLED = "1";
  const { app } = await import("../src/server.js");
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await app.connect(serverSide);
  client = new Client({ name: "contract-test", version: "0" });
  await client.connect(clientSide);
});

after(async () => {
  await client?.close();
  await new Promise<void>((r) => mock.close(() => r()));
});

function lastHit(): Hit {
  const h = hits.at(-1);
  assert.ok(h, "expected a bridge request");
  return h;
}

function text(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.map((c) => c.text ?? "").join("");
}

describe("tool surface", () => {
  it("lists the milestone-1 tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "cs2_budget",
      "cs2_city_overview",
      "cs2_demand",
      "cs2_game_state",
      "cs2_get_taxes",
      "cs2_ping",
      "cs2_run_simulation",
      "cs2_service_budgets",
      "cs2_set_service_budget",
      "cs2_set_simulation",
      "cs2_set_tax",
    ]);
  });

  it("marks reads as read-only and writes as not", async () => {
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    assert.equal(byName.cs2_get_taxes.annotations?.readOnlyHint, true);
    assert.equal(byName.cs2_set_tax.annotations?.readOnlyHint, false);
  });
});

describe("reads", () => {
  it("cs2_get_taxes is a GET to /city/taxes and returns structured content", async () => {
    const taxes = { Residential: { rate: 10, min: 0, max: 30 } };
    respond = () => ({ status: 200, body: taxes });
    const result = await client.callTool({ name: "cs2_get_taxes", arguments: {} });
    assert.equal(result.isError ?? false, false);
    assert.deepEqual(result.structuredContent, taxes);
    assert.deepEqual(JSON.parse(text(result)), taxes);
    assert.equal(lastHit().method, "GET");
    assert.equal(lastHit().path, "/city/taxes");
  });
});

describe("writes", () => {
  it("cs2_set_tax is a POST with area and rate", async () => {
    respond = () => ({ status: 200, body: { area: "Residential", rate: 12 } });
    const result = await client.callTool({ name: "cs2_set_tax", arguments: { area: "Residential", rate: 12 } });
    assert.equal(result.isError ?? false, false);
    assert.equal(lastHit().method, "POST");
    assert.equal(lastHit().path, "/city/taxes/set");
    assert.deepEqual(lastHit().query, { area: "Residential", rate: "12" });
  });

  it("rejects an unknown tax area before reaching the bridge", async () => {
    const before = hits.length;
    const result = await client.callTool({ name: "cs2_set_tax", arguments: { area: "Moon", rate: 5 } }).catch(
      (err: unknown) => ({ isError: true, content: [{ type: "text", text: String(err) }] }),
    );
    assert.equal(result.isError, true);
    assert.equal(hits.length, before, "bridge must not be called");
  });

  it("encodes spaces in service names as %20, not +", async () => {
    respond = () => ({ status: 200, body: {} });
    await client.callTool({
      name: "cs2_set_service_budget",
      arguments: { service: "Health Care", percentage: 110 },
    });
    assert.equal(lastHit().path, "/city/service-budgets/set");
    assert.match(lastHit().rawQuery, /service=Health%20Care/);
    assert.equal(lastHit().method, "POST");
  });

  it("cs2_set_simulation needs at least one argument", async () => {
    const result = await client.callTool({ name: "cs2_set_simulation", arguments: {} });
    assert.equal(result.isError, true);
  });
});

describe("errors", () => {
  it("turns a 409 into a readable 'no city loaded' tool error", async () => {
    respond = () => ({ status: 409, body: { error: "no city loaded" } });
    const result = await client.callTool({ name: "cs2_city_overview", arguments: {} });
    assert.equal(result.isError, true);
    assert.match(text(result), /No city is loaded/);
  });

  it("explains when the bridge is unreachable", async () => {
    const { Bridge } = await import("../src/bridge.js");
    const dead = new Bridge({ baseUrl: "http://127.0.0.1:1", timeoutMs: 1_000 });
    await assert.rejects(dead.call("/ping"), /Cannot reach the game bridge/);
  });
});

describe("bridge contract", () => {
  it("uses POST exactly for the routes the bridge treats as mutating", async () => {
    const { isMutatingPath } = await import("../src/bridge.js");
    for (const r of ["/city/taxes/set", "/sim/run", "/build/road", "/game/save", "/transit/lines/create"]) {
      assert.equal(isMutatingPath(r), true, r);
    }
    for (const r of ["/ping", "/city/taxes", "/city/budget", "/transit/lines"]) {
      assert.equal(isMutatingPath(r), false, r);
    }
  });
});
