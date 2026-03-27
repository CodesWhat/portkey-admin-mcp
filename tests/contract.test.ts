/**
 * Contract Tests — Validate Zod schemas against recorded API fixtures.
 *
 * These tests ensure our Zod contract schemas correctly parse actual Portkey API
 * responses. Fixtures are recorded from the live API via `tests/fixtures/record.ts`
 * and committed to the repo so contract tests run offline in CI.
 *
 * If a test fails after updating fixtures, it means the Portkey API response shape
 * has changed and the corresponding contract schema needs updating.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Contract schemas
import {
	ListConfigsResponseSchema,
	GetConfigResponseSchema,
	ConfigDetailsSchema,
	ConfigVersionsResponseSchema,
	CreateConfigResponseSchema,
} from "../src/schemas/contracts/configs.contract.js";
import {
	ListPromptsResponseSchema,
	PromptListItemSchema,
	GetPromptResponseSchema,
	CreatePromptResponseSchema,
	UpdatePromptResponseSchema,
	ListPromptVersionsResponseSchema,
} from "../src/schemas/contracts/prompts.contract.js";
import {
	ListVirtualKeysResponseSchema,
	VirtualKeySchema,
	CreateVirtualKeyResponseSchema,
	ListApiKeysResponseSchema,
	ApiKeySchema,
	CreateApiKeyResponseSchema,
} from "../src/schemas/contracts/keys.contract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures", "responses");

function loadFixture(name: string): unknown {
	const filePath = join(FIXTURES_DIR, `${name}.json`);
	return JSON.parse(readFileSync(filePath, "utf-8"));
}

// ==================== Configs ====================

describe("Contract: Configs API", () => {
	it("ListConfigsResponse schema parses configs-list fixture", () => {
		const fixture = loadFixture("configs-list");
		const result = ListConfigsResponseSchema.safeParse(fixture);
		assert.ok(
			result.success,
			`Schema validation failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
		);
		assert.ok(result.data.data.length > 0, "Should have at least one config");
	});

	it("GetConfigResponse schema parses configs-get fixture", () => {
		const fixture = loadFixture("configs-get");
		const result = GetConfigResponseSchema.safeParse(fixture);
		assert.ok(
			result.success,
			`Schema validation failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
		);
	});

	it("ConfigDetails schema parses JSON-encoded config string from fixture", () => {
		const fixture = loadFixture("configs-get") as { config: string };
		const parsed = JSON.parse(fixture.config);
		const result = ConfigDetailsSchema.safeParse(parsed);
		assert.ok(
			result.success,
			`Schema validation failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
		);
	});

	it("CreateConfigResponse schema validates expected shape", () => {
		const synthetic = {
			success: true,
			data: {
				id: "cfg_test123",
				version_id: "ver_test456",
			},
		};
		const result = CreateConfigResponseSchema.safeParse(synthetic);
		assert.ok(result.success, "CreateConfigResponse should parse");
	});

	it("ConfigVersionsResponse schema validates expected shape", () => {
		const synthetic = {
			object: "list" as const,
			total: 1,
			data: [
				{
					id: "ver_001",
					version: 1,
					config: {
						cache: { mode: "simple", max_age: 3600 },
					},
					created_at: "2025-12-01T10:00:00.000Z",
					created_by: "user_001",
				},
			],
		};
		const result = ConfigVersionsResponseSchema.safeParse(synthetic);
		assert.ok(result.success, "ConfigVersionsResponse should parse");
	});
});

// ==================== Prompts ====================

describe("Contract: Prompts API", () => {
	it("ListPromptsResponse schema parses prompts-list fixture", () => {
		const fixture = loadFixture("prompts-list");
		const result = ListPromptsResponseSchema.safeParse(fixture);
		assert.ok(
			result.success,
			`Schema validation failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
		);
		assert.ok(result.data.data.length > 0, "Should have at least one prompt");
	});

	it("PromptListItem schema parses individual prompt from fixture", () => {
		const fixture = loadFixture("prompts-list") as {
			data: unknown[];
		};
		const result = PromptListItemSchema.safeParse(fixture.data[0]);
		assert.ok(
			result.success,
			`Schema validation failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
		);
	});

	it("GetPromptResponse schema validates expected shape", () => {
		const synthetic = {
			id: "pp_test123",
			name: "test-prompt",
			slug: "test-prompt-abc",
			collection_id: "coll_001",
			workspace_id: "ws_001",
			created_at: "2025-12-01T10:00:00.000Z",
			last_updated_at: "2025-12-15T14:00:00.000Z",
			current_version: {
				id: "pv_001",
				version_number: 1,
				string: "Hello {{name}}",
				parameters: { name: "world" },
				model: "gpt-4o",
				created_at: "2025-12-01T10:00:00.000Z",
			},
			versions: [
				{
					id: "pv_001",
					version_number: 1,
					string: "Hello {{name}}",
					parameters: { name: "world" },
					model: "gpt-4o",
					created_at: "2025-12-01T10:00:00.000Z",
				},
			],
			object: "prompt" as const,
		};
		const result = GetPromptResponseSchema.safeParse(synthetic);
		assert.ok(
			result.success,
			`Schema validation failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
		);
	});

	it("CreatePromptResponse schema validates expected shape", () => {
		const synthetic = {
			id: "pp_test123",
			slug: "test-prompt-abc",
			version_id: "pv_001",
			object: "prompt" as const,
		};
		const result = CreatePromptResponseSchema.safeParse(synthetic);
		assert.ok(result.success, "CreatePromptResponse should parse");
	});

	it("UpdatePromptResponse schema validates expected shape", () => {
		const synthetic = {
			id: "pp_test123",
			slug: "test-prompt-abc",
			prompt_version_id: "pv_002",
			object: "prompt" as const,
		};
		const result = UpdatePromptResponseSchema.safeParse(synthetic);
		assert.ok(result.success, "UpdatePromptResponse should parse");
	});

	it("ListPromptVersionsResponse schema validates plain string template", () => {
		const synthetic = {
			object: "list" as const,
			total: 1,
			data: [
				{
					id: "pv_001",
					prompt_id: "pp_test123",
					prompt_template: "Hello {{name}}",
					prompt_version: 1,
					prompt_description: "Initial version",
					created_at: "2025-12-01T10:00:00.000Z",
					status: "active",
					object: "prompt" as const,
				},
			],
		};
		const result = ListPromptVersionsResponseSchema.safeParse(synthetic);
		assert.ok(result.success, "ListPromptVersionsResponse should parse plain string template");
	});

	it("ListPromptVersionsResponse schema validates object-wrapped template", () => {
		const synthetic = {
			object: "list" as const,
			total: 1,
			data: [
				{
					id: "pv_001",
					prompt_id: "pp_test123",
					prompt_template: { string: '[{"role":"system","content":[{"type":"text","text":"Hello"}]}]' },
					prompt_version: 1,
					prompt_description: "Multi-message version",
					created_at: "2025-12-01T10:00:00.000Z",
					status: "active",
					object: "prompt" as const,
				},
			],
		};
		const result = ListPromptVersionsResponseSchema.safeParse(synthetic);
		assert.ok(result.success, "ListPromptVersionsResponse should parse object-wrapped template");
	});
});

// ==================== Keys ====================

describe("Contract: Keys API", () => {
	it("ListVirtualKeysResponse schema parses virtual-keys-list fixture", () => {
		const fixture = loadFixture("virtual-keys-list");
		const result = ListVirtualKeysResponseSchema.safeParse(fixture);
		assert.ok(
			result.success,
			`Schema validation failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
		);
		assert.ok(
			result.data.data.length > 0,
			"Should have at least one virtual key",
		);
	});

	it("VirtualKey schema parses individual key from fixture", () => {
		const fixture = loadFixture("virtual-keys-list") as {
			data: unknown[];
		};
		const result = VirtualKeySchema.safeParse(fixture.data[0]);
		assert.ok(
			result.success,
			`Schema validation failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
		);
	});

	it("VirtualKey schema handles nullable fields correctly", () => {
		const fixture = loadFixture("virtual-keys-list") as {
			data: unknown[];
		};
		// All items should parse — validates that nullable fields work
		for (let i = 0; i < fixture.data.length; i++) {
			const result = VirtualKeySchema.safeParse(fixture.data[i]);
			assert.ok(
				result.success,
				`Item ${i} failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
			);
		}
	});

	it("CreateVirtualKeyResponse schema validates expected shape", () => {
		const synthetic = {
			success: true,
			data: { slug: "new-key-abc" },
		};
		const result = CreateVirtualKeyResponseSchema.safeParse(synthetic);
		assert.ok(result.success, "CreateVirtualKeyResponse should parse");
	});

	it("ListApiKeysResponse schema parses api-keys-list fixture", () => {
		const fixture = loadFixture("api-keys-list");
		const result = ListApiKeysResponseSchema.safeParse(fixture);
		assert.ok(
			result.success,
			`Schema validation failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
		);
		assert.ok(
			result.data.data.length > 0,
			"Should have at least one API key",
		);
	});

	it("ApiKey schema parses individual key from fixture", () => {
		const fixture = loadFixture("api-keys-list") as {
			data: unknown[];
		};
		const result = ApiKeySchema.safeParse(fixture.data[0]);
		assert.ok(
			result.success,
			`Schema validation failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
		);
	});

	it("CreateApiKeyResponse schema validates expected shape", () => {
		const synthetic = {
			id: "ak_new123",
			key: "pk-new-key-abc",
			object: "api-key" as const,
		};
		const result = CreateApiKeyResponseSchema.safeParse(synthetic);
		assert.ok(result.success, "CreateApiKeyResponse should parse");
	});
});
