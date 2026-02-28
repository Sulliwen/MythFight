# Repository Guidelines

## Project Structure & Module Organization
This repository is currently documentation-first. Core areas:
- `docs/`: product and production docs, organized by numbered domains (`00_vision` ... `07_ops`).
- `game/src/`: future gameplay and systems code.
- `game/data/`: versioned gameplay content (JSON/CSV/YAML once technical stack is finalized).
- `game/tests/`: technical and gameplay-logic tests.
- `assets/`: visual/audio references.
- `scripts/` and `tools/`: local automation and utility scripts.

Keep new docs in the matching numbered `docs/*` folder and cross-link related files.

## Build, Test, and Development Commands
No engine-specific build/test pipeline is committed yet. Until that is defined in `docs/03_technique/tdd-lite.md`, use:
- `codex`: start an interactive contributor session.
- `codex exec "..."`: run one-shot updates (example: `codex exec "update docs/00_vision/one-pager.md"`).
- `rg --files`: inspect repository file layout quickly.
- `git status`: verify only intended files changed.

When adding build/test tooling, expose it via documented commands in `scripts/` or a root Makefile.

## Coding Style & Naming Conventions
- Use Markdown with short, scannable sections and explicit headings.
- Prefer ASCII text and concise phrasing.
- Follow existing folder naming patterns (`NN_domain-name`) in `docs/`.
- Use kebab-case for Markdown filenames (example: `plan-test-feedback.md`).
- Keep gameplay data deterministic and diff-friendly (stable key order, one concern per file).

## Testing Guidelines
Current testing guidance lives in `docs/06_tests/plan-test-feedback.md`.
- Add tests in `game/tests/` alongside the system they validate.
- Name tests by behavior (example: `faction_balance_winrate.spec.*`).
- Track at least: average match duration, win rate by faction, rematch rate, perceived clarity, perceived fun.
- Document manual playtest outcomes using the feedback template in `docs/06_tests/plan-test-feedback.md`.

## Commit & Pull Request Guidelines
This branch has no commit history yet; adopt a consistent convention now:
- Commit format: `type(scope): imperative summary` (example: `docs(gdd): define victory conditions`).
- Keep commits small and single-purpose.
- PRs should include: objective, changed files, validation performed, and linked issue/task.
- For gameplay or UX changes, include screenshots, clips, or sample data diffs when relevant.
