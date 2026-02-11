# OpenClaw Multi-User Layer

A standalone layer that turns a single OpenClaw instance into a multi-user system where each user gets their own "brain" — isolated API keys, memory, skills, and model selection.

## How It Works

1. You define users in `users.json` (phone numbers, Telegram handles, model preferences)
2. The **config generator** produces `generated.json` — a standard OpenClaw config fragment with agents, bindings, and allow-lists
3. Your `openclaw.json` includes it via `"$include": "./multi-user/generated.json"`
4. OpenClaw routes each sender to their own agent — **zero OpenClaw source code modifications**

## Quick Start

```bash
# 1. Set shared API keys in openclaw.json (all users inherit these)
#    Add to ~/.openclaw/openclaw.json:
#    { "env": { "OPENAI_API_KEY": "sk-...", "ASSEMBLYAI_API_KEY": "..." } }

# 2. Edit users.json with your users
cp users.example.json users.json
# Only per-user keys (e.g., SuperMemory scoped keys) go here

# 3. Generate config + set up auth profiles
npm run generate

# 4. Wire into OpenClaw (one-time)
npm run cli -- wire

# 5. Start the gateway (or let a running gateway hot-reload)
openclaw gateway run
```

## Deploying into an Existing OpenClaw Installation

This folder is fully standalone — no OpenClaw source modifications needed.
You can clone it from your repo and point OpenClaw at it.

```bash
# 1. Clone (or copy) this folder next to your OpenClaw state directory
git clone https://github.com/jmoraispk/loglife.git ~/loglife
cd ~/loglife/multi-user

# 2. Set shared API keys in openclaw.json (OpenAI, AssemblyAI, etc.)
#    These are inherited by ALL agents automatically.
#    In ~/.openclaw/openclaw.json, add:
#    { "env": { "OPENAI_API_KEY": "sk-...", "ASSEMBLYAI_API_KEY": "..." } }

# 3. Create and edit your users.json
cp users.example.json users.json
# Only per-user keys (e.g., SuperMemory scoped keys) go in users.json

# 4. Generate config + auth profiles
npm run generate

# 5. Wire the $include into OpenClaw's config (one-time)
#    This adds "$include": "/path/to/loglife/multi-user/generated.json"
#    to ~/.openclaw/openclaw.json
npm run cli -- wire

# 6. That's it — OpenClaw reads the generated config on next reload/restart
```

### Adding Users While Running

OpenClaw reads agents and bindings dynamically — no restart needed.

```bash
# Add a user
npm run cli -- users add carol \
  --name "Carol" \
  --identifier "+1555000111" \
  --vault "op://LogLife_users/carol"

# Regenerate (also touches openclaw.json to trigger hot-reload)
npm run cli -- generate
```

### API Key Strategy

**Shared keys** (OpenAI, AssemblyAI, Anthropic, etc.) go in `openclaw.json`'s `env` section. All agents inherit them automatically via OpenClaw's env fallback chain. One key per provider, shared across all users.

**Per-user keys** (SuperMemory scoped keys) go in each user's `env` field in `users.json`. These get written to per-agent auth-profiles and take priority over the shared env keys.

This means most services need just one API key total — only services with per-user container isolation (like SuperMemory) need separate keys.

### 1Password Integration (Optional)

Per-user keys can be stored as `op://` references instead of raw keys:

```json
{
  "env": {
    "SUPERMEMORY_OPENCLAW_API_KEY": "op://LogLife_users/alice/SUPERMEMORY_API_KEY"
  }
}
```

At generate time, `op://` values are resolved via the 1Password CLI.
If you don't use 1Password, just put raw keys — everything still works.

## CLI Commands

```bash
npm run cli -- users list                         # List all users
npm run cli -- users add <id> [options]           # Add a user
npm run cli -- users remove <id>                  # Remove a user
npm run cli -- users auth set <id> <provider> <key>  # Set an API key
npm run cli -- generate                           # Regenerate config
npm run cli -- status                             # Show per-user usage
npm run cli -- wire                               # Wire $include into openclaw.json
```

## Files

| File | Purpose |
|------|---------|
| `users.json` | Source of truth: who are the users? |
| `users.example.json` | Example showing per-user keys (SuperMemory) and defaults |
| `generated.json` | Auto-generated OpenClaw config fragment (do not edit) |
| `src/types.ts` | TypeScript types for user profiles |
| `src/identifiers.ts` | Parse phone numbers and channel IDs into OpenClaw format |
| `src/generate.ts` | Read users.json, output generated.json |
| `src/auth-setup.ts` | Write API keys to per-agent auth-profiles.json (resolves op://) |
| `src/cli.ts` | CLI for managing users, generating config, viewing status |
| `src/test-harness.ts` | Automated isolation tests via gateway WebSocket |
| `dashboard/index.html` | Web dashboard for per-user usage stats |

## Testing

```bash
# Unit tests (requires Node 22+)
npm test

# Integration tests (requires running gateway with generated config)
npm run test-harness
```

## Design Principles

- **Zero OpenClaw modifications** — everything is config generation + data files
- **Update safe** — `git pull` from upstream will never conflict
- **Portable** — clone this folder, point OpenClaw at it, done
- **Uses existing primitives** — agents, bindings, allow-lists, auth profiles
- **Minimal per-user keys** — shared keys live in `openclaw.json` env; only scoped keys (SuperMemory) are per-user
- **Secrets stay in 1Password** — `users.json` is safe to commit (only op:// refs or scoped keys)

See `README_why.md` for detailed architecture, memory isolation analysis, and design rationale.
