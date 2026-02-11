/**
 * Multi-user configuration types.
 *
 * These types define the shape of `users.json` — the single source of truth
 * for the multi-user layer. The config generator reads this file and produces
 * a standard OpenClaw config fragment (agents, bindings, allow-lists).
 */

/** A single user profile. Each user maps to one OpenClaw agent. */
export type UserProfile = {
  /** Unique user ID — becomes the OpenClaw agent ID. Must be URL-safe. */
  id: string;

  /** Display name (optional, for dashboards and logs). */
  name?: string;

  /**
   * How to identify this user across messaging channels.
   *
   * Supported formats:
   * - `+<digits>` (E164 phone number) → auto-maps to WhatsApp + Signal
   * - `telegram:<handle_or_id>` → Telegram
   * - `discord:<user_id>` → Discord
   * - `slack:<user_id>` → Slack
   * - `signal:<uuid>` → Signal (UUID, not phone)
   */
  identifiers: string[];

  /** LLM model for this user (e.g., "anthropic/claude-sonnet-4-20250514"). */
  model?: string;

  /** Skills allowlist for this user (omit = all skills available). */
  skills?: string[];

  /**
   * API keys for this user, keyed by provider env var name.
   * These are written to per-agent auth-profiles.json, NOT to env vars
   * (because env vars are shared across all agents at config load time).
   *
   * Example: { "ANTHROPIC_API_KEY": "sk-ant-..." }
   */
  env?: Record<string, string>;

  /**
   * Advanced: raw auth profile entries for OAuth or token-based providers.
   * Keys are profile IDs (e.g., "openai-codex:default").
   */
  auth?: Record<string, AuthEntry>;
};

/** Auth entry for per-user credential setup. */
export type AuthEntry =
  | { type: "api_key"; provider: string; key: string }
  | {
      type: "oauth";
      provider: string;
      access: string;
      refresh?: string;
      expires?: number;
      email?: string;
    }
  | { type: "token"; provider: string; token: string; expires?: number };

/** The full multi-user config file shape. */
export type UsersConfig = {
  users: UserProfile[];
  defaults?: {
    /** Session isolation level. Default: "per-peer". */
    dmScope?: string;
    /** Default model if a user doesn't specify one. */
    model?: string;
  };
};

/** A parsed identifier with its resolved channel and peer ID. */
export type ParsedIdentifier = {
  channel: string;
  peerId: string;
};

/** Map of well-known env var names to their provider IDs. */
export const ENV_TO_PROVIDER: Record<string, string> = {
  ANTHROPIC_API_KEY: "anthropic",
  OPENAI_API_KEY: "openai",
  GOOGLE_API_KEY: "google",
  MISTRAL_API_KEY: "mistral",
  GROQ_API_KEY: "groq",
  TOGETHER_API_KEY: "together",
  FIREWORKS_API_KEY: "fireworks",
  DEEPSEEK_API_KEY: "deepseek",
  XAI_API_KEY: "xai",
  COHERE_API_KEY: "cohere",
  PERPLEXITY_API_KEY: "perplexity",
};
