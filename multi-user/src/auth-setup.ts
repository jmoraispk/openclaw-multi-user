/**
 * Auth profile setup.
 *
 * Reads `users.json` and writes per-user API keys to each agent's
 * `auth-profiles.json` file at `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`.
 *
 * This is the correct mechanism for per-user API key isolation because
 * auth profiles are resolved per-agent at runtime (unlike env vars which
 * are global to the process).
 *
 * Usage:
 *   bun multi-user/src/auth-setup.ts [--users multi-user/users.json] [--state-dir ~/.openclaw]
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { UsersConfig, UserProfile, AuthEntry } from "./types.ts";
import { ENV_TO_PROVIDER } from "./types.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Auth profile store version (must match OpenClaw's AUTH_STORE_VERSION). */
const AUTH_STORE_VERSION = 1;

/** Filename for auth profiles (must match OpenClaw's AUTH_PROFILE_FILENAME). */
const AUTH_PROFILE_FILENAME = "auth-profiles.json";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(): { usersPath: string; stateDir: string } {
  const args = process.argv.slice(2);
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const defaultDir = path.resolve(scriptDir, "..");

  let usersPath = path.join(defaultDir, "users.json");
  let stateDir =
    process.env.OPENCLAW_STATE_DIR?.trim() ||
    process.env.CLAWDBOT_STATE_DIR?.trim() ||
    path.join(os.homedir(), ".openclaw");

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--users" && args[i + 1]) {
      usersPath = path.resolve(args[++i]);
    } else if (args[i] === "--state-dir" && args[i + 1]) {
      stateDir = path.resolve(args[++i]);
    }
  }

  return { usersPath, stateDir };
}

// ---------------------------------------------------------------------------
// Auth profile building
// ---------------------------------------------------------------------------

type AuthProfileCredential = {
  type: "api_key" | "oauth" | "token";
  provider: string;
  key?: string;
  token?: string;
  access?: string;
  refresh?: string;
  expires?: number;
  email?: string;
};

type AuthProfileStore = {
  version: number;
  profiles: Record<string, AuthProfileCredential>;
};

/**
 * Build an auth profile store from a user's `env` and `auth` entries.
 *
 * - `env` entries (e.g., `ANTHROPIC_API_KEY`) are mapped to API key profiles
 *   using the ENV_TO_PROVIDER mapping.
 * - `auth` entries are written as-is (for OAuth/token credentials).
 */
export function buildAuthProfiles(user: UserProfile): AuthProfileStore {
  const profiles: Record<string, AuthProfileCredential> = {};

  // Process env-style API keys
  if (user.env) {
    for (const [envVar, apiKey] of Object.entries(user.env)) {
      const provider = ENV_TO_PROVIDER[envVar];
      if (!provider) {
        // Unknown env var — try to infer provider from name pattern
        // e.g., "MISTRAL_API_KEY" -> "mistral"
        const match = envVar.match(/^([A-Z_]+?)_API_KEY$/);
        const inferredProvider = match ? match[1].toLowerCase().replace(/_/g, "-") : envVar.toLowerCase();
        const profileId = `${inferredProvider}:default`;
        profiles[profileId] = {
          type: "api_key",
          provider: inferredProvider,
          key: apiKey,
        };
      } else {
        const profileId = `${provider}:default`;
        profiles[profileId] = {
          type: "api_key",
          provider,
          key: apiKey,
        };
      }
    }
  }

  // Process explicit auth entries
  if (user.auth) {
    for (const [profileId, entry] of Object.entries(user.auth)) {
      if (entry.type === "api_key") {
        profiles[profileId] = {
          type: "api_key",
          provider: entry.provider,
          key: entry.key,
        };
      } else if (entry.type === "oauth") {
        profiles[profileId] = {
          type: "oauth",
          provider: entry.provider,
          access: entry.access,
          refresh: entry.refresh,
          expires: entry.expires,
          email: entry.email,
        };
      } else if (entry.type === "token") {
        profiles[profileId] = {
          type: "token",
          provider: entry.provider,
          token: entry.token,
          expires: entry.expires,
        };
      }
    }
  }

  return {
    version: AUTH_STORE_VERSION,
    profiles,
  };
}

/**
 * Resolve the auth-profiles.json path for a given agent.
 */
function resolveAgentAuthPath(stateDir: string, agentId: string): string {
  return path.join(stateDir, "agents", agentId, "agent", AUTH_PROFILE_FILENAME);
}

/**
 * Write auth profiles for a user, merging with any existing profiles.
 *
 * If a profile already exists on disk, we merge our profiles into it
 * (our entries take precedence). This preserves any profiles that were
 * set up via `openclaw models auth login` or other external tools.
 */
export function writeAuthProfiles(
  stateDir: string,
  user: UserProfile,
  options: { dryRun?: boolean } = {},
): { path: string; profileCount: number; merged: boolean } {
  const authStore = buildAuthProfiles(user);
  if (Object.keys(authStore.profiles).length === 0) {
    return { path: "", profileCount: 0, merged: false };
  }

  const authPath = resolveAgentAuthPath(stateDir, user.id);
  const dir = path.dirname(authPath);

  // Try to load existing profiles to merge
  let existing: AuthProfileStore | null = null;
  let merged = false;
  if (fs.existsSync(authPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(authPath, "utf-8")) as AuthProfileStore;
      merged = true;
    } catch {
      // Corrupted file — overwrite
    }
  }

  const finalStore: AuthProfileStore = {
    version: AUTH_STORE_VERSION,
    profiles: {
      ...(existing?.profiles ?? {}),
      ...authStore.profiles, // Our entries take precedence
    },
  };

  if (options.dryRun) {
    console.log(`  [dry-run] Would write ${Object.keys(finalStore.profiles).length} profiles to ${authPath}`);
    return { path: authPath, profileCount: Object.keys(finalStore.profiles).length, merged };
  }

  // Ensure directory exists
  fs.mkdirSync(dir, { recursive: true });

  // Write atomically: write to tmp then rename
  const tmpPath = authPath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(finalStore, null, 2) + "\n");
  fs.renameSync(tmpPath, authPath);

  return { path: authPath, profileCount: Object.keys(finalStore.profiles).length, merged };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const { usersPath, stateDir } = parseArgs();

  console.log(`Reading users from: ${usersPath}`);
  console.log(`State directory: ${stateDir}`);

  if (!fs.existsSync(usersPath)) {
    console.error(`Error: ${usersPath} does not exist.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(usersPath, "utf-8"));
  const config = raw as UsersConfig;

  let totalProfiles = 0;
  for (const user of config.users) {
    const hasAuth = (user.env && Object.keys(user.env).length > 0) ||
                    (user.auth && Object.keys(user.auth).length > 0);
    if (!hasAuth) {
      console.log(`  ${user.id}: no auth entries, skipping`);
      continue;
    }

    const result = writeAuthProfiles(stateDir, user);
    if (result.profileCount > 0) {
      const mergeNote = result.merged ? " (merged with existing)" : "";
      console.log(`  ${user.id}: wrote ${result.profileCount} profile(s) to ${result.path}${mergeNote}`);
      totalProfiles += result.profileCount;
    }
  }

  console.log(`\nDone. Set up ${totalProfiles} auth profile(s) for ${config.users.length} user(s).`);
}

// Allow importing without running main
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("auth-setup.ts")) {
  main();
}
