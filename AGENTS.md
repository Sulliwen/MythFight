# AGENTS.md

## Project Overview
MythFight is a multiplayer Castle Fight-style game with mythological factions.

- The server is authoritative and owns all gameplay state.
- Clients send intentions and render server snapshots.
- Simulation must stay deterministic and stable across clients.

## Repository Structure
This repository is a pnpm workspace with active applications plus product docs.

- `apps/game-server/`: Node.js WebSocket game server.
- `apps/web/`: React 19 + Vite + Pixi.js web client.
- `docs/`: product, design, tech, tests, and ops documentation in numbered folders.
- `assets/`: visual and audio references.
- `scripts/` and `tools/`: local automation and utilities.

When working inside an app, also follow the closer-scope instructions:

- `apps/game-server/AGENTS.md`
- `apps/web/AGENTS.md`

## Core Architecture

### Server
- Fixed-tick simulation at 20 TPS / 50 ms.
- All gameplay logic runs server-side: spawn, movement, combat, damage, victory.
- Protocol validation must be strict and explicit.
- Avoid non-deterministic logic in world updates.

Key files:

- `apps/game-server/src/index.ts`: WebSocket bootstrap and tick loop.
- `apps/game-server/src/world.ts`: world state, stepping, snapshots.
- `apps/game-server/src/creatures.ts`: creature stats and definitions.
- `apps/game-server/src/protocol.ts`: message parsing and validation.
- `apps/game-server/src/network.ts`: connection handling and snapshot broadcast.
- `apps/game-server/src/pathfinding.ts`: movement/path logic.

### Client
- Thin rendering layer over authoritative snapshots.
- Smoothness comes from interpolation, not local authoritative simulation.
- Keep the UI readable and responsive under latency.

Key files:

- `apps/web/src/App.tsx`: top-level app flow.
- `apps/web/src/hooks/useGameSocket.ts`: socket lifecycle, ping/pong, snapshot handling.
- `apps/web/src/components/LaneCanvas.tsx`: game canvas entry point.
- `apps/web/src/components/lane-canvas/runtime.ts`: Pixi runtime and render loop.
- `apps/web/src/components/lane-canvas/interpolation.ts`: frame interpolation.
- `apps/web/src/components/victory/VictoryOverlay.tsx`: end-game overlay.

### Network Protocol
Current protocol messages:

- Client -> Server: `join`, `spawn`, `new_game`, `ping`
- Server -> Client: `welcome`, `snapshot`, `pong`, `error`

Do not change protocol behavior casually. If protocol shape changes, update docs and both apps together.

## Development Commands
Run from the repository root unless noted otherwise.

```bash
pnpm dev:server                           # Start the game server in watch mode
pnpm dev:web                              # Start the web client
pnpm --filter @mythfight/game-server build
pnpm --filter @mythfight/game-server start
pnpm --filter @mythfight/web build
pnpm --filter @mythfight/web lint
rg --files
git status
```

No automated test framework is configured yet. Validate changes with the relevant build, lint, and manual checks.

## Engineering Rules

### Change Discipline
- Make small, atomic changes.
- Do not mix refactor, feature, and formatting without a reason.
- Preserve existing behavior unless the task explicitly changes it.
- Explain behavior changes clearly in commit messages and notes.

### Reliability and Safety
- Validate all external inputs: network, user, env, file content.
- Fail with actionable errors, not silent fallbacks.
- Handle disconnects, cleanup paths, and resource lifecycle.
- Prefer deterministic logic for gameplay and server simulation.

### Code Style
- Prefer simple, maintainable solutions over clever ones.
- Keep files reasonably small when practical.
- Avoid duplication; extract shared logic when justified.
- Use explicit types and stable contracts at module boundaries.
- Keep functions focused and names clear.

### Documentation
- Keep docs and code in sync when behavior, architecture, or workflow changes.
- Put docs in the matching `docs/NN_domain-name/` folder.
- Use Markdown with short, scannable sections.
- Use kebab-case for Markdown filenames.

## Validation Expectations

### Server Changes
- Run `pnpm --filter @mythfight/game-server build`.
- Smoke-test `join`, `spawn`, `snapshot`, and `ping/pong`.
- Check for multi-client state regressions when relevant.

### Web Changes
- Run `pnpm --filter @mythfight/web lint`.
- Run `pnpm --filter @mythfight/web build`.
- Manually test with 2 local clients when relevant.
- Check behavior under both low latency and simulated higher latency.

### Docs-Only Changes
- Verify file placement, links, naming, and consistency with existing docs.

If full validation is not possible, state what was not tested and why.

## Commits and PRs
- Commit format: `type(scope): imperative summary`
- Keep commits small and single-purpose.
- PRs should include objective, changed files, validation performed, and linked issue/task.
- For gameplay or UX changes, include screenshots, clips, or representative diffs when useful.
