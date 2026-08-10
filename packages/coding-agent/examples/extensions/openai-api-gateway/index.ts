/**
 * Local OpenAI Responses gateway with native Responses compaction.
 *
 * Normal turns use POST /v1/responses. Prime's session compaction hook sends
 * discarded messages to POST /v1/responses/compact, stores the opaque output
 * in CompactionEntry.details, and replays it unchanged on later Responses calls.
 * A normal Prime text summary remains in the session as a cross-provider and
 * recovery fallback.
 *
 * Usage:
 *   cp -R examples/extensions/openai-api-gateway ~/.prime/agent/extensions/
 */

import {
	type Api,
	convertResponsesMessages,
	getLogger,
	type Model,
	type SimpleStreamOptions,
	streamSimpleOpenAIResponses,
} from "@earendil-works/pi-ai";
import {
	type CompactionResult,
	compact,
	convertToLlm,
	type ExtensionAPI,
	type ProviderModelConfig,
} from "@earendil-works/pi-coding-agent";
import {
	isRecord,
	latestNativeCompact,
	NATIVE_COMPACT_DETAILS_KEY,
	NATIVE_COMPACT_FORMAT,
	NATIVE_COMPACT_MARKER,
	type NativeCompactState,
	replayNativeCompact,
} from "./utils.js";

const PROVIDER_ID = process.env.PRIME_OPENAI_API_GATEWAY_PROVIDER_ID || "openai-api-gateway";
const PROVIDER_NAME = process.env.PRIME_OPENAI_API_GATEWAY_NAME || "Local OpenAI API Gateway (2234)";
const PROVIDER_API = "openai-api-gateway-responses";
const BASE_URL = trimTrailingSlash(process.env.PRIME_OPENAI_API_GATEWAY_BASE_URL || "http://127.0.0.1:2234/v1");
const API_KEY = process.env.PRIME_OPENAI_API_GATEWAY_API_KEY || "dummy";
const SESSION_PREFIX = process.env.PRIME_OPENAI_API_GATEWAY_SESSION_PREFIX || "prime";
const COMPACT_TIMEOUT_MS = positiveInteger(process.env.PRIME_OPENAI_API_GATEWAY_COMPACT_TIMEOUT_MS, 120_000);
const MAX_ERROR_BODY_CHARS = 2_000;

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const DEFAULT_CONTEXT_WINDOW = 272_000;
const DEFAULT_MAX_TOKENS = 128_000;
const DEFAULT_MODELS = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];
const OPENAI_TOOL_CALL_PROVIDERS = new Set([PROVIDER_ID, "openai", "openai-codex", "opencode"]);
const NATIVE_COMPACT_FAILURE_DETAILS_KEY = "openaiResponsesCompactFailure";
const log = getLogger("extension.openai-api-gateway");

interface CompactResponse {
	id?: string;
	object?: string;
	output: unknown[];
	usage?: unknown;
}

export default function (pi: ExtensionAPI) {
	configureOpenAIApiGateway(pi, convertResponsesMessages);
}

export function configureOpenAIApiGateway(
	pi: ExtensionAPI,
	responsesMessageConverter: typeof convertResponsesMessages,
): void {
	let activeNativeCompact: NativeCompactState | undefined;
	let suppressNativeReplay = 0;
	let nativeReplayNoticeShown = false;

	registerGatewayProvider(pi, `${SESSION_PREFIX}:startup:${process.pid}`);

	pi.on("session_start", (_event, ctx) => {
		const poolSessionId = `${SESSION_PREFIX}:${ctx.sessionManager.getSessionId()}`;
		registerGatewayProvider(pi, poolSessionId);
		activeNativeCompact = latestNativeCompact(ctx.sessionManager.getBranch());
		nativeReplayNoticeShown = false;
		if (activeNativeCompact && ctx.hasUI) {
			ctx.ui.notify("Native Responses compact state restored", "info");
		}
	});

	pi.on("session_shutdown", () => {
		activeNativeCompact = undefined;
		nativeReplayNoticeShown = false;
	});

	pi.on("session_before_compact", async (event, ctx) => {
		const model = ctx.model as Model<Api> | undefined;
		if (!model || model.provider !== PROVIDER_ID) return;

		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok || !auth.apiKey) {
			ctx.ui.notify(
				auth.ok ? `No API key for ${PROVIDER_ID}; using text compaction` : `${auth.error}; using text compaction`,
				"warning",
			);
			return;
		}

		let fallback: CompactionResult;
		suppressNativeReplay++;
		try {
			fallback = await compact(
				event.preparation,
				model,
				auth.apiKey,
				auth.headers,
				event.customInstructions,
				event.signal,
				pi.getThinkingLevel(),
			);
		} finally {
			suppressNativeReplay--;
		}

		try {
			const previousNative = latestNativeCompact(event.branchEntries);
			const newMessages = convertToLlm([
				...event.preparation.messagesToSummarize,
				...event.preparation.turnPrefixMessages,
			]);
			const converted = responsesMessageConverter(model, { messages: newMessages }, OPENAI_TOOL_CALL_PROVIDERS, {
				includeSystemPrompt: false,
			});
			const input = [...(previousNative?.output ?? []), ...converted];
			if (input.length === 0) {
				throw new Error("Native compact input is empty");
			}

			const native = await requestNativeCompact(model, input, auth.apiKey, auth.headers, event.signal);
			return {
				compaction: {
					...fallback,
					summary: `${NATIVE_COMPACT_MARKER}\n${fallback.summary}`,
					details: {
						...(isRecord(fallback.details) ? fallback.details : {}),
						[NATIVE_COMPACT_DETAILS_KEY]: native,
					},
				},
			};
		} catch (error) {
			const failure = errorMessage(error);
			if (!event.signal.aborted) {
				ctx.ui.notify(`Native Responses compaction failed; kept text fallback: ${failure}`, "warning");
			}
			return {
				compaction: {
					...fallback,
					details: {
						...(isRecord(fallback.details) ? fallback.details : {}),
						[NATIVE_COMPACT_FAILURE_DETAILS_KEY]: {
							format: NATIVE_COMPACT_FORMAT,
							endpoint: `${BASE_URL}/responses/compact`,
							createdAt: new Date().toISOString(),
							error: failure,
						},
					},
				},
			};
		}
	});

	pi.on("session_compact", (event, ctx) => {
		activeNativeCompact = latestNativeCompact([event.compactionEntry]);
		nativeReplayNoticeShown = false;
		if (activeNativeCompact && ctx.hasUI) {
			ctx.ui.notify(
				`Native Responses compaction stored (${activeNativeCompact.outputItemTypes.join(", ") || "opaque"})`,
				"info",
			);
		}
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (suppressNativeReplay > 0 || ctx.model?.provider !== PROVIDER_ID || !activeNativeCompact) return;
		const replayed = replayNativeCompact(event.payload, activeNativeCompact);
		if (replayed !== event.payload && !nativeReplayNoticeShown) {
			nativeReplayNoticeShown = true;
			log.info("native compact replay injected", {
				format: activeNativeCompact.format,
				model: activeNativeCompact.model,
				responseId: activeNativeCompact.responseId,
			});
			if (ctx.hasUI) ctx.ui.notify("Native Responses compact replay injected", "info");
		}
		return replayed;
	});
}

function registerGatewayProvider(pi: ExtensionAPI, poolSessionId: string): void {
	pi.registerProvider(PROVIDER_ID, {
		name: PROVIDER_NAME,
		baseUrl: BASE_URL,
		apiKey: API_KEY,
		api: PROVIDER_API,
		headers: { "X-Pool-Session-ID": poolSessionId },
		streamSimple: (model, context, options) =>
			streamSimpleOpenAIResponses(
				{ ...model, maxTokens: 0 } as Model<"openai-responses">,
				context,
				withoutUnsupportedMaxTokens(options),
			),
		models: configuredModels(),
	});
}

function withoutUnsupportedMaxTokens(options?: SimpleStreamOptions): SimpleStreamOptions | undefined {
	return options ? { ...options, maxTokens: undefined } : undefined;
}

async function requestNativeCompact(
	model: Model<Api>,
	input: unknown[],
	apiKey: string,
	headers: Record<string, string> | undefined,
	parentSignal: AbortSignal,
): Promise<NativeCompactState> {
	const endpoint = `${BASE_URL}/responses/compact`;
	const controller = new AbortController();
	const abortFromParent = () => controller.abort(parentSignal.reason);
	if (parentSignal.aborted) {
		abortFromParent();
	} else {
		parentSignal.addEventListener("abort", abortFromParent, { once: true });
	}
	const timeout = setTimeout(
		() => controller.abort(new Error("Native compact request timed out")),
		COMPACT_TIMEOUT_MS,
	);

	try {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				...headers,
			},
			body: JSON.stringify({ model: model.id, input }),
			signal: controller.signal,
		});
		if (!response.ok) {
			const body = (await response.text()).slice(0, MAX_ERROR_BODY_CHARS);
			throw new Error(`POST ${endpoint} returned ${response.status}: ${body || response.statusText}`);
		}

		const data = parseCompactResponse(await response.json());
		return {
			format: NATIVE_COMPACT_FORMAT,
			provider: PROVIDER_ID,
			model: model.id,
			endpoint,
			createdAt: new Date().toISOString(),
			responseId: data.id,
			responseObject: data.object,
			output: structuredClone(data.output),
			outputItemTypes: data.output.map(itemType),
			usage: data.usage,
		};
	} finally {
		clearTimeout(timeout);
		parentSignal.removeEventListener("abort", abortFromParent);
	}
}

function parseCompactResponse(value: unknown): CompactResponse {
	if (!isRecord(value) || !Array.isArray(value.output) || value.output.length === 0) {
		throw new Error("Native compact response has no opaque output items");
	}
	return {
		id: typeof value.id === "string" ? value.id : undefined,
		object: typeof value.object === "string" ? value.object : undefined,
		output: value.output,
		usage: value.usage,
	};
}

function configuredModels(): ProviderModelConfig[] {
	const raw = process.env.PRIME_OPENAI_API_GATEWAY_MODELS;
	const ids = raw
		? raw
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean)
		: DEFAULT_MODELS;
	return (ids.length > 0 ? ids : DEFAULT_MODELS).map(gatewayModel);
}

function gatewayModel(id: string): ProviderModelConfig {
	return {
		id,
		name: id,
		reasoning: true,
		input: ["text"],
		cost: ZERO_COST,
		contextWindow: DEFAULT_CONTEXT_WINDOW,
		maxTokens: DEFAULT_MAX_TOKENS,
		thinkingLevelMap: {
			minimal: null,
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: "xhigh",
			max: "max",
		},
	};
}

function itemType(value: unknown): string {
	return isRecord(value) && typeof value.type === "string" ? value.type : "unknown";
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function positiveInteger(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}
