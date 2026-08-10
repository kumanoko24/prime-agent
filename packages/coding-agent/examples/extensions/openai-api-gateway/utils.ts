import type { SessionEntry } from "../../../src/core/session-manager.js";

export const NATIVE_COMPACT_DETAILS_KEY = "openaiResponsesCompact";
export const NATIVE_COMPACT_FORMAT = "prime.openai-responses-compact.v1";
export const NATIVE_COMPACT_MARKER = `[${NATIVE_COMPACT_FORMAT}]`;

export interface NativeCompactState {
	format: typeof NATIVE_COMPACT_FORMAT;
	provider: string;
	model: string;
	endpoint: string;
	createdAt: string;
	responseId?: string;
	responseObject?: string;
	output: unknown[];
	outputItemTypes: string[];
	usage?: unknown;
}

export function replayNativeCompact(payload: unknown, state: NativeCompactState): unknown {
	if (!isRecord(payload) || !Array.isArray(payload.input)) return payload;
	const markerIndex = payload.input.findIndex(containsNativeCompactMarker);
	if (markerIndex < 0) return payload;
	return {
		...payload,
		input: [
			...payload.input.slice(0, markerIndex),
			...structuredClone(state.output),
			...payload.input.slice(markerIndex + 1),
		],
	};
}

function containsNativeCompactMarker(value: unknown): boolean {
	if (!isRecord(value) || value.role !== "user" || !Array.isArray(value.content)) return false;
	return value.content.some(
		(item) =>
			isRecord(item) &&
			item.type === "input_text" &&
			typeof item.text === "string" &&
			item.text.includes(NATIVE_COMPACT_MARKER),
	);
}

export function latestNativeCompact(entries: SessionEntry[]): NativeCompactState | undefined {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry.type === "compaction") return nativeCompactFromEntry(entry);
	}
	return undefined;
}

function nativeCompactFromEntry(entry: { details?: unknown }): NativeCompactState | undefined {
	if (!isRecord(entry.details)) return undefined;
	const value = entry.details[NATIVE_COMPACT_DETAILS_KEY];
	if (
		!isRecord(value) ||
		value.format !== NATIVE_COMPACT_FORMAT ||
		typeof value.provider !== "string" ||
		typeof value.model !== "string" ||
		typeof value.endpoint !== "string" ||
		typeof value.createdAt !== "string" ||
		!Array.isArray(value.output) ||
		!Array.isArray(value.outputItemTypes) ||
		!value.outputItemTypes.every((item) => typeof item === "string")
	) {
		return undefined;
	}
	return {
		format: NATIVE_COMPACT_FORMAT,
		provider: value.provider,
		model: value.model,
		endpoint: value.endpoint,
		createdAt: value.createdAt,
		responseId: typeof value.responseId === "string" ? value.responseId : undefined,
		responseObject: typeof value.responseObject === "string" ? value.responseObject : undefined,
		output: value.output,
		outputItemTypes: value.outputItemTypes,
		usage: value.usage,
	};
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
