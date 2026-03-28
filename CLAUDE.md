# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MythFight is a Castle Fight-style multiplayer game with mythological factions. It uses an authoritative server architecture: the server owns all gameplay state, clients send intentions and render snapshots.

## Monorepo Structure

pnpm workspace with two apps (no shared packages yet):

- **`apps/game-server`** — Node.js WebSocket game server. Deterministic fixed-tick simulation (20 TPS / 50ms). All gameplay logic (spawn, movement, combat, victory) runs here.
- **`apps/web`** — React 19 + Vite + Pixi.js 8 client. Thin display layer that interpolates between server snapshots for smooth rendering. PWA-enabled.

## Commands

```bash
# Development (run from repo root)
pnpm dev:server          # Start game server with hot reload (tsx watch, port 8082)
pnpm dev:web             # Start web client dev server (Vite, port 5173)

# Build
pnpm --filter @mythfight/web build          # tsc + vite build
pnpm --filter @mythfight/game-server build  # tsc

# Lint (web only)
pnpm --filter @mythfight/web lint           # eslint (flat config, TS + React hooks)

# Production server
pnpm --filter @mythfight/game-server start  # node dist/index.js
```

No test framework is configured yet.

## Architecture

### Network Protocol (WebSocket)

Client → Server: `join` (roomId="local", playerId), `spawn`, `new_game`, `ping`
Server → Client: `welcome` (tickRate, playerId), `snapshot` (tick, castle HP, units), `pong`, `error`

### Server (`apps/game-server/src/`)

- `index.ts` — WS server bootstrap + tick loop (setInterval at 50ms)
- `world.ts` — Game state: `createWorld()`, `spawnUnit()`, `stepWorld()`, `buildSnapshot()`. Lane is 0–1000 on X axis, castles start at 100 HP.
- `creatures.ts` — Unit stat definitions (currently only "golem")
- `protocol.ts` — Message parsing/validation
- `network.ts` — Connection handlers, snapshot broadcast

### Client (`apps/web/src/`)

- `hooks/useGameSocket.ts` — WebSocket lifecycle, ping/pong RTT, snapshot batching with interpolation delay
- `components/lane-canvas/runtime.ts` — Pixi.js Application setup and render loop
- `components/lane-canvas/unit-sprite-layer.ts` — Sprite animation and lifecycle
- `components/lane-canvas/interpolation.ts` — Frame interpolation between server snapshots
- `App.tsx` — Top-level: menu overlay, victory overlay, game stage

### Key Design Rules

- **Server is authoritative**: client never decides gameplay outcomes
- **Deterministic simulation**: stable processing order per tick, no implicit randomness
- **Strict protocol validation**: invalid payloads get explicit error responses, no data leaks

## Conventions

- **Commits**: `type(scope): imperative summary` (e.g., `feat(web): add victory overlay`)
- **Docs**: Markdown in `docs/NN_domain-name/`, kebab-case filenames
- **Definition of done (web)**: lint passes, build passes, manual 2-client test, lag resilience check (0 vs 200+ ms)
- **Definition of done (server)**: build passes, smoke test covers join+spawn+snapshot+ping/pong, no multi-client state regression
