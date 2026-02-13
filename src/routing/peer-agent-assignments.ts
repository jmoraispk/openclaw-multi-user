import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import type { RoutePeer } from "./resolve-route.js";
import { listAgentIds } from "../agents/agent-scope.js";
import { resolveStateDir } from "../config/paths.js";
import { normalizeAgentId } from "./session-key.js";

/** Prefix for dynamically created agents (one per peer when agents.list is empty). */
export const DYNAMIC_AGENT_PREFIX = "user-";

const ASSIGNMENTS_FILENAME = "peer-agent-assignments.json";

function normalizePart(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Build a stable key for a peer (channel + accountId + kind + id) for use in the assignment store.
 */
export function buildPeerKey(params: {
  channel: string;
  accountId?: string | null;
  peer?: RoutePeer | null;
}): string {
  const channel = normalizePart(params.channel);
  const accountId = normalizePart(params.accountId) || "default";
  const peer = params.peer;
  if (!peer?.id) {
    return `${channel}:${accountId}:none`;
  }
  const kind = normalizePart(peer.kind) || "dm";
  const id = (peer.id ?? "").trim();
  return `${channel}:${accountId}:${kind}:${id}`;
}

function assignmentsPath(): string {
  return path.join(resolveStateDir(), ASSIGNMENTS_FILENAME);
}

function loadAssignments(): Record<string, string> {
  const filePath = assignmentsPath();
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(data)) {
        if (typeof key === "string" && typeof value === "string" && value.trim()) {
          out[key] = value.trim();
        }
      }
      return out;
    }
  } catch {
    // missing or invalid: return empty
  }
  return {};
}

function saveAssignments(assignments: Record<string, string>): void {
  const filePath = assignmentsPath();
  const dir = path.dirname(filePath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(assignments, null, 2), "utf-8");
  } catch (err) {
    console.warn(`peer-agent-assignments: failed to save ${filePath}: ${String(err)}`);
  }
}

/** Derive a stable, filesystem-safe agent id from peerKey for dynamic (zero-config) agents. */
function dynamicAgentIdFromPeerKey(peerKey: string): string {
  const lastPart = peerKey.split(":").pop() ?? "";
  const digits = lastPart.replace(/\D/g, "").slice(0, 32);
  if (digits) {
    return `${DYNAMIC_AGENT_PREFIX}${digits}`;
  }
  const hash = createHash("sha256").update(peerKey).digest("hex").slice(0, 12);
  return `${DYNAMIC_AGENT_PREFIX}x${hash}`;
}

/**
 * When auto-assign is enabled, new peers (contacts) that have no binding are assigned to an agent.
 * - If agents.list is empty: create one isolated dynamic agent per peer (user-<digits> or user-x<hash>).
 * - Otherwise: assign in round-robin order (by fewest current assignments).
 * Returns the agentId for the given peerKey.
 */
export function getOrAssignPeerAgent(cfg: OpenClawConfig, peerKey: string): string {
  const configuredList = cfg.agents?.list ?? [];
  const hasZeroConfiguredAgents = configuredList.length === 0;

  const assignments = loadAssignments();
  const existing = assignments[peerKey];
  if (existing) {
    const normalized = normalizeAgentId(existing);
    if (hasZeroConfiguredAgents) {
      return normalized;
    }
    const agentIds = listAgentIds(cfg);
    if (agentIds.includes(normalized)) {
      return normalized;
    }
    // Stored agent no longer in config; reassign below
  }

  if (hasZeroConfiguredAgents) {
    const newAgentId = dynamicAgentIdFromPeerKey(peerKey);
    assignments[peerKey] = newAgentId;
    saveAssignments(assignments);
    return newAgentId;
  }

  const agentIds = listAgentIds(cfg);
  const counts = new Map<string, number>();
  for (const id of agentIds) {
    counts.set(id, 0);
  }
  for (const agentId of Object.values(assignments)) {
    const n = normalizeAgentId(agentId);
    if (counts.has(n)) {
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
  }
  let chosen = agentIds[0];
  let minCount = counts.get(chosen) ?? 0;
  for (const id of agentIds) {
    const c = counts.get(id) ?? 0;
    if (c < minCount) {
      minCount = c;
      chosen = id;
    }
  }
  assignments[peerKey] = chosen;
  saveAssignments(assignments);
  return chosen;
}
