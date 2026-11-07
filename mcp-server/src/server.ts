import { Skybridge } from "skybridge/server";

// Skybridge sends a UDP usage metric on every tool call unless this is set. It
// checks per call, so defaulting it here covers the server at runtime. The CLI
// (`skybridge dev/build`) has its own telemetry; disable that with
// `npx skybridge telemetry disable`.
process.env.SKYBRIDGE_TELEMETRY_DISABLED ??= "1";
import { Bridge } from "./bridge.js";
import { registerTools } from "./tools.js";

export const app = new Skybridge({
  name: "govskylines",
  version: "0.1.0",
  instructions:
    "Controls a running Cities: Skylines II city through the GovSkylines bridge mod. " +
    "Read state before changing it, make one change at a time, and re-read to verify.",
  // One bridge client for the process; the handler runs per request.
  setup: () => new Bridge(),
  handler: (server, bridge) => registerTools(server, bridge),
});

export type AppType = typeof app;
