# OpenAI Responses Native Compaction Continuity

Updated: 2026-08-15 06:53 UTC+8

## Cause and objective

The local gateway at `http://127.0.0.1:2234/v1` exposes `POST /responses/compact`. Prime Agent previously used Chat Completions transport and text-only compaction, so it could not preserve or replay the gateway's opaque native compact state.

## Previous milestone: native compaction

Implement and live-verify one local gateway extension that:

- uses Responses transport for normal turns;
- retains Prime's text summary as a cross-provider fallback;
- stores opaque compact output in `CompactionEntry.details`;
- replays that output unchanged in the next Responses input;
- treats compact item types as opaque rather than hardcoding `compaction`.

Success evidence: focused tests, full `npm run check`, committed source, installed extension, and a real Prime session that compacts through port 2234 then recalls a pre-compaction marker.

Recovery boundary: restore the timestamped `~/.prime/agent` extension backup. No daemon protocol, credentials, or session schema are changed.

## Previous milestone: fork-backed source installation

Make Noel's fork the canonical writable remote and the actual CLI source:

- `origin` is `https://github.com/kumanoko24/prime-agent.git` and local `main` tracks `origin/main`;
- `upstream` is `https://github.com/PrimeIntellect-ai/prime-agent`;
- upstream `main` through `97b994c3d` is merged after the native compact commit;
- `~/.local/bin/prime-agent` preserves the local MCP bearer-token export and launches `/Volumes/K/Works/prime-agent/prime-agent.sh`, while the npm `prime-agent@0.7.2` remains untouched as rollback;
- the gateway extension imports its converter and implementation from this fork, not the old npm package;
- source-mode extension resolution prefers workspace `dist`, then workspace `src`, then an installed package, and explicitly supports the `pi-ai/mcp` subpath.

Success evidence: GitHub HEAD equality after push, clean tracking state, full `npm run check`, focused source-loader and compact tests, CLI process provenance, the 2234 model catalog, and a real isolated daemon request through the fork launcher.

Recovery boundary: restore `~/.prime/agent/backups/20260815-0615-cumi-fork-reinstall/prime-agent` over `~/.local/bin/prime-agent` to return to the untouched NVM npm installation, then restore `~/.prime/agent/backups/20260811-2100-fork-source-install/openai-api-gateway.ts` if the gateway extension must also roll back. Do not restart or replace unrelated active daemons.

## Current milestone: OpenCode Go DeepSeek V4 max effort

Expose `max` as a selectable reasoning effort for OpenCode Go's `deepseek-v4-flash` and `deepseek-v4-pro`, while preserving their existing `xhigh -> max` mapping and leaving the DeepSeek and OpenRouter providers unchanged.

Success evidence: generated catalog regression, full `npm run check`, real `--thinking max` requests to both OpenCode Go models, and a fresh default daemon request through the globally installed fork wrapper.

Recovery boundary: revert this milestone commit. No protocol, credential, session schema, or provider endpoint changes are involved.

## Status

- PASS: focused Vitest file passed 3 tests; full `npm run check` passed.
- PASS: Prime 0.7.1 + Luna/max completed normal Responses turns without the gateway-rejected `max_output_tokens` field.
- PASS: gateway request `8f4211b6c62e42c1bb3b0f209b5c9407` completed `POST /v1/responses/compact` with HTTP 200.
- PASS: session compaction details persisted `response.compaction` response `resp_002087cf37ff6eca016a7a1920c4f081919993270df6004501` with opaque item types `message` and live gateway-specific `compaction_summary`.
- PASS: after a fresh isolated daemon restart and session resume, Prime displayed `Native Responses compact replay injected` and returned `FINAL_REPLAY_PASS`; `agent.jsonl` recorded the same compact response ID at info level.
- Installed: `~/.prime/agent/extensions/openai-api-gateway.ts` imports both the converter and canonical extension from `/Volumes/K/Works/prime-agent`. Runtime backups are under `~/.prime/agent/backups/20260811-0219-openai-responses-compact/` and `~/.prime/agent/backups/20260811-2100-fork-source-install/`.
- Cleaned: all three isolated RBV daemons were stopped through the daemon protocol; the default daemon stayed at PID 68490. Temporary `pi-ai` runtime patches were removed and verified bit-for-bit against their backups.
- PASS: `kumanoko24/prime-agent` exists; local `main` tracks its `origin/main`; upstream's eight newer commits were merged as `0f2e1acf7` and pushed.
- PASS: source-mode extension regression changed from 22 failures to 29/29 passing after adding workspace source fallbacks and the explicit MCP subpath.
- PASS: the fork launcher resolves first in PATH and lists Luna, Sol, and Terra from `openai-api-gateway`, each with 272K context and 128K max output.
- PASS: an isolated source-launched daemon at `/tmp/prime-fork-rbv.G2N1ea/daemon.sock` used Luna/max through port 2234 and returned `PRIME_FORK_SOURCE_LUNA_MAX_RBV_PASS`; its supervisor cwd was `/Volumes/K/Works/prime-agent`.
- Cleaned: `shutdownDaemonAndWait` returned `stopped:true` for the isolated RBV socket, and both its supervisor and worker exited; unrelated Prime PIDs 95829 and 95883 remained running and were not signalled.
- Observed outside this milestone: `status --json` is advertised by help but rejected, while placing `--daemon-socket` before `status` treats `status` as a prompt. This did not affect the fork install or compaction flow and remains unmodified.
- PASS: the 2026-08-12 CUMI refresh merged upstream commits `795a21de6` and `47dccfad4` as merge commit `d4a7addcb`, preserving all fork commits and the compact extension.
- PASS: `npm ci` installed the merged lockfile with npm 11.12.1; `npm run check` passed and the Down Arrow, extension-loader, and compact focused suites passed 48/48 tests on Vitest 4.1.10.
- PASS: the refreshed source-linked install listed all three 272K/128K gateway models, and an isolated Luna/max request returned `PRIME_CUMI_FORK_INSTALL_RBV_PASS`.
- PASS: isolated daemon provenance showed launcher argv `/Volumes/K/Works/prime-agent/prime-agent.sh --mode daemon`, daemon cwd `/Volumes/K/Works/prime-agent`, and protocol shutdown `stopped:true`.
- Observed from the upstream lockfile: `npm audit` reports one moderate transitive `protobufjs@7.6.4` denial-of-service advisory through `@google/genai`; no off-upstream audit mutation was applied.
- Deployed: the prior default daemon PID 95829 reported zero active sessions, was stopped through `shutdownDaemonAndWait`, and was replaced by fork-launched default daemon PID 80357 with cwd `/Volumes/K/Works/prime-agent`.
- PASS: the refreshed default daemon used Luna/max through port 2234, returned `PRIME_CUMI_DEFAULT_DAEMON_RBV_PASS`, and reported `current` with zero active sessions after the rollout.
- PASS: the 2026-08-15 CUMI refresh merged 20 upstream commits through `97b994c3d` as merge commit `c303b0cad`; the only conflicts were the AI and coding-agent changelogs, where fork-only entries stayed under `[Unreleased]` and upstream v0.7.2 entries stayed in the released section.
- PASS: `npm ci` installed the upstream lockfile with Node 24.15.0 and npm 11.12.1; `npm run check` passed, and 797 focused agent, AI, coding-agent, TUI, source-loader, native compact, daemon-ledger, host-request, resume, URL, and fullscreen tests passed.
- Observed from the upstream lockfile: `npm audit` reports one moderate and two high advisories in `protobufjs`, `nanoid`, and direct `extract-zip`; `extract-zip` has no available fix, and no off-upstream or under-seven-day dependency mutation was applied.
- Reinstalled: `~/.local/bin/prime-agent` now preserves `MCP_AUTH_TOKEN` setup and executes this fork's `prime-agent.sh`; the overwritten upstream wrapper and both pre-rollover session JSONLs are recoverable under `~/.prime/agent/backups/20260815-0615-cumi-fork-reinstall/`.
- PASS: port 2234 reported healthy and ready with five eligible accounts; the installed fork listed Luna, Sol, and Terra at 272K/128K, and an isolated Luna/max request returned `PRIME_CUMI_97B994_FORK_REINSTALL_RBV_PASS` from a daemon whose cwd was this repository.
- Cleaned: isolated daemon shutdown returned `stopped:true`, and its exact socket no longer had a listener.
- Deployed: the prior default daemon held two unattached `needs_input` sessions with no streaming, tools, queue, or RLM work; protocol 7/schema 16 matched the fork, both JSONLs were backed up, and exact-socket shutdown appended only their durable `archived` state.
- PASS: the replacement default daemon PID 9753 has cwd `/Volumes/K/Works/prime-agent`, reported `current` with zero sessions, and a real Luna/max request returned `PRIME_CUMI_DEFAULT_97B994_FORK_RBV_PASS`.
- Corrected NO-PASS: the initial reinstall verdict missed bare interactive startup from outside the checkout. `npm ci` removed untracked workspace `dist` trees, and `prime-agent.sh` started `tsx` without the repository `tsconfig.json`, so a fresh client from `~/empty` resolved `@earendil-works/pi-agent-core` to missing `dist/index.js`. The earlier `-p` request reused an already-running daemon and did not exercise this client import graph.
- Fixed: the source launcher now passes `--tsconfig /Volumes/K/Works/prime-agent/tsconfig.json`, preserving the user's cwd while resolving workspace packages directly from source without generated `dist` artifacts.
- Prevention PASS: `check:source-launcher` starts the real launcher from a fresh external temp directory and requires the exact package version; the new check and full `npm run check` passed with all workspace `dist` directories absent.
- Rendered Human PoV PASS: after attaching a real terminal client to the bounded tmux harness, bare `prime-agent` from `/Users/noelbao/empty` rendered the Prime splash, v0.7.2, `cwd ~/empty`, selected model, prompt guidance, and controls. The blank detached capture was a no-client terminal-capability artifact, not the rendered user surface.
- Cleaned: the exact test tmux session was removed, its zero-message draft was stopped through `prime-agent stop`, and the default daemon returned to `current` with zero sessions.
- PASS: OpenCode Go DeepSeek V4 Flash and Pro now expose `off`, `high`, `xhigh`, and `max`; both `xhigh` and `max` serialize to the provider's `max` effort, while direct DeepSeek and OpenRouter metadata remain unchanged.
- PASS: the focused reasoning-level suite passed 18/18 tests and the full `npm run check` completed with no warnings or type errors.
- PASS: isolated live requests returned `OPENCODE_GO_V4_FLASH_MAX_RBV_PASS` and `OPENCODE_GO_V4_PRO_MAX_RBV_PASS` with `--thinking max`; the isolated daemon was stopped through the protocol and its empty temp directory was removed.
- Deployed: default daemon PID 9753 had one idle, non-busy session and was stopped through the protocol. The installed fork wrapper started fresh daemon PID 98392, returned `FRESH_DEFAULT_OPENCODE_GO_V4_MAX_RBV_PASS`, and reported zero active or busy sessions afterward.
