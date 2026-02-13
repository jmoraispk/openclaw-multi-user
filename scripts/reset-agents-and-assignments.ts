#!/usr/bin/env node
/**
 * Reset agents to 0 and clear peer-agent assignments for testing auto-assign.
 * - Sets agents.list = [] and bindings = [] in openclaw.json
 * - Deletes peer-agent-assignments.json
 *
 * Usage: node --import tsx scripts/reset-agents-and-assignments.ts
 * Or:    pnpm exec tsx scripts/reset-agents-and-assignments.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createConfigIO } from "../src/config/io.js";
import { resolveStateDir } from "../src/config/paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSIGNMENTS_FILENAME = "peer-agent-assignments.json";

async function main() {
  const io = createConfigIO();
  const snapshot = await io.readConfigFileSnapshot();
  if (!snapshot.valid) {
    console.error("Config is invalid; fix config before reset.");
    process.exit(1);
  }
  const cfg = { ...snapshot.config };
  cfg.agents = { ...cfg.agents, list: [] };
  cfg.bindings = [];
  await io.writeConfigFile(cfg);
  console.log("Config updated: agents.list = [], bindings = []");

  const stateDir = resolveStateDir();
  const assignmentsPath = path.join(stateDir, ASSIGNMENTS_FILENAME);
  if (fs.existsSync(assignmentsPath)) {
    fs.unlinkSync(assignmentsPath);
    console.log(`Deleted ${assignmentsPath}`);
  } else {
    console.log(`No ${ASSIGNMENTS_FILENAME} to delete`);
  }

  console.log(
    "Done. Restart the gateway and send a message from one number; that number will get a dedicated dynamic agent (user-<digits>).",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
