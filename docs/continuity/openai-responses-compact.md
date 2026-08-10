# OpenAI Responses Native Compaction Continuity

Updated: 2026-08-11 02:44 UTC+8

## Cause and objective

The local gateway at `http://127.0.0.1:2234/v1` exposes `POST /responses/compact`. Prime Agent previously used Chat Completions transport and text-only compaction, so it could not preserve or replay the gateway's opaque native compact state.

## Current milestone

Implement and live-verify one local gateway extension that:

- uses Responses transport for normal turns;
- retains Prime's text summary as a cross-provider fallback;
- stores opaque compact output in `CompactionEntry.details`;
- replays that output unchanged in the next Responses input;
- treats compact item types as opaque rather than hardcoding `compaction`.

Success evidence: focused tests, full `npm run check`, committed source, installed extension, and a real Prime session that compacts through port 2234 then recalls a pre-compaction marker.

Recovery boundary: restore the timestamped `~/.prime/agent` extension backup and the timestamped installed `pi-ai` index backups. No daemon protocol, credentials, or session schema are changed.

## Status

- PASS: focused Vitest file passed 3 tests; full `npm run check` passed.
- PASS: Prime 0.7.1 + Luna/max completed normal Responses turns without the gateway-rejected `max_output_tokens` field.
- PASS: gateway request `8f4211b6c62e42c1bb3b0f209b5c9407` completed `POST /v1/responses/compact` with HTTP 200.
- PASS: session compaction details persisted `response.compaction` response `resp_002087cf37ff6eca016a7a1920c4f081919993270df6004501` with opaque item types `message` and live gateway-specific `compaction_summary`.
- PASS: after a fresh isolated daemon restart and session resume, Prime displayed `Native Responses compact replay injected` and returned `FINAL_REPLAY_PASS`; `agent.jsonl` recorded the same compact response ID at info level.
- Installed: `~/.prime/agent/extensions/openai-api-gateway.ts` injects the current Prime 0.7.1 converter into the canonical extension. Runtime backups are under `~/.prime/agent/backups/20260811-0219-openai-responses-compact/`.
- Cleaned: all three isolated RBV daemons were stopped through the daemon protocol; the default daemon stayed at PID 68490. Temporary `pi-ai` runtime patches were removed and verified bit-for-bit against their backups.
