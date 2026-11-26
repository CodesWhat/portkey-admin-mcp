import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerAnalyticsTools } from "../src/tools/analytics.tools.js";
import { registerIntegrationsTools } from "../src/tools/integrations.tools.js";
import {
	parseToolResult,
	registerToolCallbacks,
} from "./helpers/tool-registry.js";

type RegisterTools = (server: never, service: never) => void;

function callbacksFor(
	register: RegisterTools,
	domain: string,
	implementation: Record<string, unknown>,
) {
	return registerToolCallbacks((server) => {
		register(server as never, { [domain]: implementation } as never);
	});
}

const RANGE = {
	time_of_generation_min: "2026-01-01T00:00:00Z",
	time_of_generation_max: "2026-01-02T00:00:00Z",
};

describe("spec response fields survive tool output", () => {
	it("keeps unique_error_codes and avg_weighted_feedback in graph output", async () => {
		const callbacks = callbacksFor(registerAnalyticsTools, "analytics", {
			getErrorStatusCodesAnalytics: async () => ({
				object: "analytics-graph",
				summary: { total_errors: 9, unique_error_codes: 3 },
				data_points: [{ timestamp: "2026-01-01T00:00:00Z", total: 9 }],
			}),
			getFeedbackModelsAnalytics: async () => ({
				object: "analytics-graph",
				summary: {},
				data_points: [
					{ ai_model: "gpt-4o", total: 4, avg_weighted_feedback: 2 },
				],
			}),
		});
		const errors = parseToolResult(
			await callbacks.get("get_error_status_codes_analytics")?.(RANGE),
		);
		assert.deepEqual(errors.summary, {
			total_errors: 9,
			unique_error_codes: 3,
		});
		const models = parseToolResult(
			await callbacks.get("get_feedback_models_analytics")?.(RANGE),
		);
		assert.deepEqual((models.data_points as Array<unknown>)[0], {
			ai_model: "gpt-4o",
			total: 4,
			avg_weighted_feedback: 2,
		});
	});

	it("keeps metadata_value in metadata group rows", async () => {
		const row = {
			metadata_value: "prod",
			requests: 5,
			cost: 1,
			avg_tokens: 10,
			avg_weighted_feedback: 1,
			requests_with_feedback: 3,
		};
		const callbacks = callbacksFor(registerAnalyticsTools, "analytics", {
			getAnalyticsGroupMetadata: async () => ({ total: 1, data: [row] }),
		});
		const payload = parseToolResult(
			await callbacks.get("get_analytics_group_metadata")?.({
				...RANGE,
				metadata_key: "environment",
			}),
		);
		assert.deepEqual(payload.metadata_groups, [row]);
	});

	it("keeps operands, pay_per_hour and pay_per_token in pricing output", async () => {
		const pricing = {
			currency: "USD",
			calculate: {
				request: {
					operation: "multiply",
					operands: [
						{ value: "input_tokens" },
						{ value: "rates.request_token" },
					],
				},
			},
			finetune_config: {
				pay_per_token: { price: 0.1 },
				pay_per_hour: { price: 2 },
			},
		};
		const callbacks = callbacksFor(registerIntegrationsTools, "integrations", {
			getModelPricing: async () => pricing,
		});
		const payload = parseToolResult(
			await callbacks.get("get_model_pricing")?.({
				provider: "openai",
				model: "gpt-4o",
			}),
		);
		assert.deepEqual(payload, pricing);
	});
});
