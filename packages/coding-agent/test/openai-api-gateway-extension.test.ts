import { describe, expect, it } from "vitest";
import {
	latestNativeCompact,
	NATIVE_COMPACT_MARKER,
	replayNativeCompact,
} from "../examples/extensions/openai-api-gateway/utils.js";
import type { SessionEntry } from "../src/core/session-manager.js";

const nativeState = {
	format: "prime.openai-responses-compact.v1" as const,
	provider: "openai-api-gateway",
	model: "gpt-5.6-sol",
	endpoint: "http://127.0.0.1:2234/v1/responses/compact",
	createdAt: "2026-08-11T00:00:00.000Z",
	responseId: "resp_compact_test",
	responseObject: "response.compaction",
	output: [
		{ type: "message", role: "user", content: [{ type: "input_text", text: "old request" }] },
		{ type: "compaction_summary", encrypted_content: "opaque-ciphertext" },
	],
	outputItemTypes: ["message", "compaction_summary"],
};

describe("OpenAI Responses compact gateway extension", () => {
	it("replays opaque compact output unchanged in place of the fallback marker", () => {
		const payload = {
			model: "gpt-5.6-sol",
			input: [
				{ role: "developer", content: "system" },
				{
					role: "user",
					content: [{ type: "input_text", text: `Prime fallback\n${NATIVE_COMPACT_MARKER}` }],
				},
				{ role: "user", content: [{ type: "input_text", text: "new request" }] },
			],
		};

		const replayed = replayNativeCompact(payload, nativeState) as typeof payload;

		expect(replayed.input).toEqual([payload.input[0], ...nativeState.output, payload.input[2]]);
		expect(nativeState.output[1]).toEqual({
			type: "compaction_summary",
			encrypted_content: "opaque-ciphertext",
		});
	});

	it("leaves non-Responses or marker-free payloads untouched", () => {
		const payload = { messages: [{ role: "user", content: "hello" }] };
		expect(replayNativeCompact(payload, nativeState)).toBe(payload);
	});

	it("restores state only from the latest compaction entry", () => {
		const nativeEntry = compactionEntry("native", { openaiResponsesCompact: nativeState });
		const plainEntry = compactionEntry("plain", { readFiles: [] });

		expect(latestNativeCompact([nativeEntry])).toEqual(nativeState);
		expect(latestNativeCompact([nativeEntry, plainEntry])).toBeUndefined();
	});
});

function compactionEntry(id: string, details: unknown): SessionEntry {
	return {
		type: "compaction",
		id,
		parentId: null,
		timestamp: "2026-08-11T00:00:00.000Z",
		summary: "summary",
		firstKeptEntryId: "kept",
		tokensBefore: 1,
		details,
	};
}
