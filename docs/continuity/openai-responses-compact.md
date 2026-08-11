# OpenAI Responses Native Compaction Continuity

Updated: 2026-08-11 21:00 UTC+8

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

## Current milestone: fork-backed source installation

Make Noel's fork the canonical writable remote and the actual CLI source:

- `origin` is `https://github.com/kumanoko24/prime-agent.git` and local `main` tracks `origin/main`;
- `upstream` is `https://github.com/PrimeIntellect-ai/prime-agent`;
- upstream `main` through `14d6e7491` is merged after the native compact commit;
- `~/.local/bin/prime-agent` launches `/Volumes/K/Works/prime-agent/prime-agent.sh`, while the prior npm `prime-agent@0.7.1` remains untouched as rollback;
- the gateway extension imports its converter and implementation from this fork, not the old npm package;
- source-mode extension resolution prefers workspace `dist`, then workspace `src`, then an installed package, and explicitly supports the `pi-ai/mcp` subpath.

Success evidence: GitHub HEAD equality after push, clean tracking state, full `npm run check`, focused source-loader and compact tests, CLI process provenance, the 2234 model catalog, and a real isolated daemon request through the fork launcher.

Recovery boundary: move `~/.local/bin/prime-agent` aside so PATH falls back to the untouched NVM npm installation, then restore `~/.prime/agent/backups/20260811-2100-fork-source-install/openai-api-gateway.ts`. Do not restart or replace unrelated active daemons.

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
