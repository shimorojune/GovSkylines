import { appendFile, mkdir } from "node:fs/promises";

const LOG = "minutes/cabinet-log.jsonl";

export async function logEvent(event: Record<string, unknown>): Promise<void> {
  await mkdir("minutes", { recursive: true });
  await appendFile(LOG, JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n");
}
