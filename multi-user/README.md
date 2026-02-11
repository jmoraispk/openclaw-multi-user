# OpenClaw Multi-User Layer

A standalone layer that turns a single OpenClaw instance into a multi-user system where each user gets their own "brain" — isolated API keys, memory, skills, and model selection.

## How It Works

1. You define users in `users.json` (phone numbers, Telegram handles, API keys, model preferences)
2. The **config generator** produces `generated.json` — a standard OpenClaw config fragment with agents, bindings, and allow-lists
3. Your `openclaw.json` includes it via `"$include": "./multi-user/generated.json"`
4. The **auth-setup** script writes per-user API keys to each agent's auth profile store
5. OpenClaw routes each sender to their own agent — **zero OpenClaw source code modifications**

## Quick Start

```bash
# 1. Edit users.json with your users
cp users.example.json users.json
# Edit users.json with real identifiers and API keys

# 2. Generate config + set up auth profiles
npm run generate
npm run auth-setup

# 3. Add $include to your openclaw.json (one-time)
# Or run: npm run cli -- wire
npm run cli -- wire

# 4. Start the gateway
openclaw gateway run

# 5. Test (optional — requires running gateway)
npm run test-harness
```

## Or use the convenience wrapper

```bash
./run.sh
```

## Files

| File | Purpose |
|------|---------|
| `users.json` | Source of truth: who are the users? |
| `generated.json` | Auto-generated OpenClaw config fragment (do not edit) |
| `src/types.ts` | TypeScript types for user profiles |
| `src/identifiers.ts` | Parse phone numbers and channel IDs into OpenClaw format |
| `src/generate.ts` | Read users.json, output generated.json |
| `src/auth-setup.ts` | Write API keys to per-agent auth-profiles.json |
| `src/test-harness.ts` | Automated isolation tests via gateway WebSocket |
| `src/cli.ts` | CLI for managing users (Phase 2) |

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
- **Portable** — copy this directory to any OpenClaw installation
- **Uses existing primitives** — agents, bindings, allow-lists, auth profiles

See the full design document in the plan file for detailed architecture and rationale.
