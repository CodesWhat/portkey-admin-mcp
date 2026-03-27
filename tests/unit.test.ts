/**
 * Unit tests for isolated logic paths:
 * - parseErrorResponse: body.error / body.data / top-level fallback
 * - updatePrompt: string stays as string & template_metadata → prompt_metadata remap + patch flag
 * - template unwrapping & format detection in get_prompt
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseErrorResponse } from "../src/lib/fetch.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Response whose .json() resolves to `body`. */
function fakeResponse(status: number, body: unknown): Response {
	return {
		ok: false,
		status,
		json: () => Promise.resolve(body),
	} as unknown as Response;
}

/** Simulate the template-unwrapping logic from get_prompt tool handler. */
function unwrapTemplate(rawTemplate: unknown): {
	templateString: string;
	templateFormat: string;
} {
	const inner =
		typeof rawTemplate === "object" &&
		rawTemplate !== null &&
		"string" in rawTemplate
			? (rawTemplate as Record<string, unknown>).string
			: rawTemplate;
	const templateString =
		typeof inner === "string" ? inner : JSON.stringify(inner);
	let templateFormat = "plain string";
	if (typeof templateString === "string") {
		const trimmed = templateString.trim();
		if (trimmed.startsWith("[")) {
			try {
				const parsed = JSON.parse(trimmed);
				if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].role) {
					templateFormat = "multi-message (JSON messages array)";
				}
			} catch {
				// Not valid JSON — treat as plain string
			}
		}
	}
	return { templateString, templateFormat };
}

/** Simulate the updatePrompt body-building logic from PromptsService. */
function buildUpdateBody(data: {
	template_metadata?: Record<string, unknown>;
	string?: string;
	model?: string;
	version_description?: string;
}): Record<string, unknown> {
	const { template_metadata, ...rest } = data;
	const body: Record<string, unknown> = { ...rest, patch: true };
	if (template_metadata !== undefined) {
		body.prompt_metadata = template_metadata;
	}
	return body;
}

// ---------------------------------------------------------------------------
// parseErrorResponse
// ---------------------------------------------------------------------------

describe("parseErrorResponse", () => {
	it("extracts message from body.error (standard format)", async () => {
		const res = fakeResponse(422, {
			status_code: 422,
			success: false,
			error: { message: "Invalid config", slug: "invalid_config", code: "AB01" },
		});
		const err = await parseErrorResponse(res);
		assert.equal(err.message, "Invalid config");
		assert.equal(err.code, "AB01");
		assert.equal(err.slug, "invalid_config");
		assert.equal(err.status_code, 422);
	});

	it("extracts message from body.data (Portkey alternate format)", async () => {
		const res = fakeResponse(400, {
			success: false,
			data: { message: "Invalid request. Please check and try again.", errorCode: "AB01" },
		});
		const err = await parseErrorResponse(res);
		assert.equal(err.message, "Invalid request. Please check and try again.");
		assert.equal(err.code, "AB01");
		assert.equal(err.status_code, 400);
	});

	it("extracts message from top-level body when no error/data wrapper", async () => {
		const res = fakeResponse(403, {
			message: "Forbidden",
			code: "FORBIDDEN",
		});
		const err = await parseErrorResponse(res);
		assert.equal(err.message, "Forbidden");
		assert.equal(err.code, "FORBIDDEN");
	});

	it("prefers body.error over body.data when both present", async () => {
		const res = fakeResponse(400, {
			error: { message: "from error" },
			data: { message: "from data" },
		});
		const err = await parseErrorResponse(res);
		assert.equal(err.message, "from error");
	});

	it("falls back to generic message when body is not JSON", async () => {
		const res = {
			ok: false,
			status: 502,
			json: () => Promise.reject(new Error("not json")),
		} as unknown as Response;
		const err = await parseErrorResponse(res);
		assert.equal(err.message, "HTTP error! status: 502");
		assert.equal(err.status_code, 502);
	});

	it("includes errorCode in fallback message when message is missing", async () => {
		const res = fakeResponse(400, {
			success: false,
			data: { errorCode: "AB99" },
		});
		const err = await parseErrorResponse(res);
		assert.equal(err.message, "HTTP error! status: 400 (AB99)");
		assert.equal(err.code, "AB99");
	});

	it("uses response.status when body.status_code is absent", async () => {
		const res = fakeResponse(429, { data: { message: "Rate limited" } });
		const err = await parseErrorResponse(res);
		assert.equal(err.status_code, 429);
	});

	it("handles null JSON body without throwing", async () => {
		const res = fakeResponse(500, null);
		const err = await parseErrorResponse(res);
		assert.equal(err.status_code, 500);
		assert.equal(err.message, "HTTP error! status: 500");
	});
});

// ---------------------------------------------------------------------------
// updatePrompt body building (field remaps + patch flag)
// ---------------------------------------------------------------------------

describe("updatePrompt body building", () => {
	it("always includes patch: true", () => {
		const body = buildUpdateBody({ string: "hello" });
		assert.equal(body.patch, true);
	});

	it("keeps string field as-is (not remapped)", () => {
		const body = buildUpdateBody({ string: "hello {{name}}" });
		assert.equal(body.string, "hello {{name}}");
		assert.equal("prompt_template" in body, false);
	});

	it("omits string when not provided", () => {
		const body = buildUpdateBody({ model: "gpt-4" });
		assert.equal("string" in body, false);
	});

	it("remaps template_metadata to prompt_metadata", () => {
		const body = buildUpdateBody({
			template_metadata: { app: "hourlink", env: "prod" },
			string: "test",
		});
		assert.deepEqual(body.prompt_metadata, { app: "hourlink", env: "prod" });
		assert.equal(body.template_metadata, undefined);
	});

	it("omits prompt_metadata when template_metadata is not provided", () => {
		const body = buildUpdateBody({ string: "test", model: "gpt-4" });
		assert.equal("prompt_metadata" in body, false);
		assert.equal(body.string, "test");
		assert.equal(body.model, "gpt-4");
	});

	it("passes through other fields untouched", () => {
		const body = buildUpdateBody({
			string: "new template",
			model: "claude-3-opus",
			version_description: "v2",
		});
		assert.equal(body.string, "new template");
		assert.equal(body.model, "claude-3-opus");
		assert.equal(body.version_description, "v2");
	});

	it("keeps string and remaps template_metadata together", () => {
		const body = buildUpdateBody({
			string: '[{"role":"system","content":"Be helpful"}]',
			template_metadata: { env: "dev" },
		});
		assert.equal(
			body.string,
			'[{"role":"system","content":"Be helpful"}]',
		);
		assert.deepEqual(body.prompt_metadata, { env: "dev" });
		assert.equal(body.template_metadata, undefined);
	});
});

// ---------------------------------------------------------------------------
// Template unwrapping & format detection
// ---------------------------------------------------------------------------

describe("template unwrapping & format detection", () => {
	it("returns plain string as-is", () => {
		const { templateString, templateFormat } = unwrapTemplate("Hello {{name}}");
		assert.equal(templateString, "Hello {{name}}");
		assert.equal(templateFormat, "plain string");
	});

	it("detects multi-message JSON array format", () => {
		const messages = '[{"role":"system","content":"Be helpful"}]';
		const { templateString, templateFormat } = unwrapTemplate(messages);
		assert.equal(templateString, messages);
		assert.equal(templateFormat, "multi-message (JSON messages array)");
	});

	it("does not misidentify plain text starting with [ as multi-message", () => {
		const { templateFormat } = unwrapTemplate("[Note: this is just text]");
		assert.equal(templateFormat, "plain string");
	});

	it("does not misidentify JSON array without role field", () => {
		const { templateFormat } = unwrapTemplate("[1, 2, 3]");
		assert.equal(templateFormat, "plain string");
	});

	it("unwraps nested { string: '...' } object", () => {
		const { templateString, templateFormat } = unwrapTemplate({
			string: "Hello {{user}}",
		});
		assert.equal(templateString, "Hello {{user}}");
		assert.equal(templateFormat, "plain string");
	});

	it("unwraps nested { string: '...' } with JSON array content", () => {
		const inner = '[{"role":"user","content":"hi"}]';
		const { templateString, templateFormat } = unwrapTemplate({ string: inner });
		assert.equal(templateString, inner);
		assert.equal(templateFormat, "multi-message (JSON messages array)");
	});

	it("handles nested { string: <non-string> } safely via JSON.stringify", () => {
		const { templateString } = unwrapTemplate({ string: 42 });
		assert.equal(templateString, "42");
	});

	it("handles null template", () => {
		const { templateString, templateFormat } = unwrapTemplate(null);
		assert.equal(templateString, "null");
		assert.equal(templateFormat, "plain string");
	});

	it("handles undefined template", () => {
		// JSON.stringify(undefined) returns undefined (not a string).
		// In practice rawTemplate is only undefined when current_version is null,
		// which is guarded before this logic runs. Test documents the behavior.
		const { templateString } = unwrapTemplate(undefined);
		assert.equal(templateString, undefined);
	});

	it("handles empty object without string key", () => {
		const { templateString } = unwrapTemplate({});
		assert.equal(templateString, "{}");
	});
});
