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

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
	CacheSummaryResponseSchema,
	ProviderGroupAnalyticsResponseSchema,
} from "../src/schemas/contracts/analytics.contract.js";
// Contract schemas
import {
	ConfigDetailsSchema,
	ConfigVersionsResponseSchema,
	CreateConfigResponseSchema,
	GetConfigResponseSchema,
	ListConfigsResponseSchema,
} from "../src/schemas/contracts/configs.contract.js";
import { ListDeploymentsResponseSchema } from "../src/schemas/contracts/deployments.contract.js";
import {
	ApiKeySchema,
	CreateApiKeyResponseSchema,
	CreateVirtualKeyResponseSchema,
	ListApiKeysResponseSchema,
	ListVirtualKeysResponseSchema,
	RotateApiKeyResponseSchema,
	VirtualKeySchema,
} from "../src/schemas/contracts/keys.contract.js";
import {
	ListRateLimitsResponseSchema,
	ListUsageLimitEntitiesResponseSchema,
	ListUsageLimitsResponseSchema,
} from "../src/schemas/contracts/limits.contract.js";
import { ListMcpIntegrationsResponseSchema } from "../src/schemas/contracts/mcp-integrations.contract.js";
import {
	CreatePromptResponseSchema,
	GetPromptResponseSchema,
	ListPromptsResponseSchema,
	ListPromptVersionsResponseSchema,
	PromptListItemSchema,
	RawGetPromptResponseSchema,
	UpdatePromptResponseSchema,
} from "../src/schemas/contracts/prompts.contract.js";
import {
	CreateSecretReferenceResponseSchema,
	ListSecretReferencesResponseSchema,
	SecretReferenceDetailSchema,
} from "../src/schemas/contracts/secret-references.contract.js";

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

	it("GetPromptResponse schema defaults versions to [] when omitted", () => {
		const synthetic = {
			id: "pp_test123",
			name: "test-prompt",
			slug: "test-prompt-abc",
			collection_id: "coll_001",
			created_at: "2025-12-01T10:00:00.000Z",
			last_updated_at: "2025-12-15T14:00:00.000Z",
			object: "prompt" as const,
		};
		const result = GetPromptResponseSchema.safeParse(synthetic);
		assert.ok(
			result.success,
			`Schema validation failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
		);
		assert.deepStrictEqual(result.data.versions, []);
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
		assert.ok(
			result.success,
			"ListPromptVersionsResponse should parse plain string template",
		);
	});

	it("ListPromptVersionsResponse schema validates object-wrapped template", () => {
		const synthetic = {
			object: "list" as const,
			total: 1,
			data: [
				{
					id: "pv_001",
					prompt_id: "pp_test123",
					prompt_template: {
						string:
							'[{"role":"system","content":[{"type":"text","text":"Hello"}]}]',
					},
					prompt_version: 1,
					prompt_description: "Multi-message version",
					created_at: "2025-12-01T10:00:00.000Z",
					status: "active",
					object: "prompt" as const,
				},
			],
		};
		const result = ListPromptVersionsResponseSchema.safeParse(synthetic);
		assert.ok(
			result.success,
			"ListPromptVersionsResponse should parse object-wrapped template",
		);
	});

	it("RawGetPromptResponse schema parses prompts-get fixture", () => {
		const fixture = loadFixture("prompts-get");
		const result = RawGetPromptResponseSchema.safeParse(fixture);
		assert.ok(
			result.success,
			`Schema validation failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
		);
		assert.ok(result.data.id, "fixture should have an id");
		assert.ok(
			result.data.prompt_version_id,
			"fixture should have a prompt_version_id",
		);
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
		assert.ok(result.data.data.length > 0, "Should have at least one API key");
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

describe("Contract: newly documented control-plane fixtures", () => {
	it("includes API-key rotation and Secret Reference response fixtures", async () => {
		for (const fixtureName of [
			"api-keys-rotate",
			"secret-references-list",
			"secret-references-get",
		]) {
			assert.ok(
				existsSync(join(FIXTURES_DIR, `${fixtureName}.json`)),
				`missing fixture ${fixtureName}`,
			);
		}

		assert.equal(
			ListSecretReferencesResponseSchema.safeParse(
				loadFixture("secret-references-list"),
			).success,
			true,
		);
		assert.equal(
			SecretReferenceDetailSchema.safeParse(
				loadFixture("secret-references-get"),
			).success,
			true,
		);
		assert.equal(
			CreateSecretReferenceResponseSchema.safeParse(
				loadFixture("secret-references-create"),
			).success,
			true,
		);
		assert.equal(
			RotateApiKeyResponseSchema.safeParse(loadFixture("api-keys-rotate"))
				.success,
			true,
		);
	});
});

describe("Contract: current control-plane read fixtures", () => {
	it("validates deployments and MCP integrations", () => {
		assert.equal(
			ListDeploymentsResponseSchema.safeParse(loadFixture("deployments-list"))
				.success,
			true,
		);
		assert.equal(
			ListMcpIntegrationsResponseSchema.safeParse(
				loadFixture("mcp-integrations-list"),
			).success,
			true,
		);
	});

	it("validates current rate and usage policy shapes", () => {
		assert.equal(
			ListRateLimitsResponseSchema.safeParse(loadFixture("rate-limits-list"))
				.success,
			true,
		);
		assert.equal(
			ListUsageLimitsResponseSchema.safeParse(loadFixture("usage-limits-list"))
				.success,
			true,
		);
		assert.equal(
			ListUsageLimitEntitiesResponseSchema.safeParse(
				loadFixture("usage-limit-entities-list"),
			).success,
			true,
		);
	});

	it("validates current cache and provider analytics shapes", () => {
		assert.equal(
			CacheSummaryResponseSchema.safeParse(
				loadFixture("analytics-cache-summary"),
			).success,
			true,
		);
		assert.equal(
			ProviderGroupAnalyticsResponseSchema.safeParse(
				loadFixture("analytics-providers-group"),
			).success,
			true,
		);
	});
});

// ==================== Fixture provenance ====================

describe("Contract: fixtures manifest", () => {
	it("records when fixtures were captured", () => {
		const manifest = JSON.parse(
			readFileSync(join(__dirname, "fixtures", "manifest.json"), "utf-8"),
		);
		assert.ok(
			typeof manifest.recordedAt === "string" &&
				/^\d{4}-\d{2}-\d{2}/.test(manifest.recordedAt),
			"manifest.recordedAt must be an ISO date documenting fixture recency",
		);
	});

	it("records documentation-derived fixture provenance until live capture succeeds", () => {
		const manifest = JSON.parse(
			readFileSync(join(__dirname, "fixtures", "manifest.json"), "utf-8"),
		) as {
			documentationDerivedFixtures?: string[];
			liveCaptureStatus?: string;
		};
		const allowedDocumentationDerivedFixtures = [
			"api-keys-rotate",
			"analytics-cache-summary",
			"analytics-providers-group",
			"deployments-list",
			"mcp-integrations-list",
			"rate-limits-list",
			"secret-references-create",
			"secret-references-get",
			"secret-references-list",
			"usage-limit-entities-list",
			"usage-limits-list",
		];
		for (const fixtureName of manifest.documentationDerivedFixtures ?? []) {
			assert.ok(
				allowedDocumentationDerivedFixtures.includes(fixtureName),
				`unexpected documentation-derived fixture: ${fixtureName}`,
			);
		}
		if ((manifest.documentationDerivedFixtures?.length ?? 0) > 0) {
			assert.ok(
				manifest.liveCaptureStatus?.includes("403"),
				"blocked documentation-derived fixtures must record the live-capture status",
			);
		}
	});

	it("records permission-blocked captures explicitly", () => {
		const manifest = JSON.parse(
			readFileSync(join(__dirname, "fixtures", "manifest.json"), "utf-8"),
		) as {
			captureOutcomes?: Record<
				string,
				{ status?: string; httpStatus?: number }
			>;
		};
		assert.deepEqual(manifest.captureOutcomes?.["users-list"], {
			status: "permission-blocked",
			httpStatus: 403,
			lastAttemptedAt: "2026-07-14",
		});
	});

	it("stays in sync with the fixtures on disk", () => {
		const manifest = JSON.parse(
			readFileSync(join(__dirname, "fixtures", "manifest.json"), "utf-8"),
		);
		const onDisk = readdirSync(FIXTURES_DIR)
			.filter((file) => file.endsWith(".json"))
			.map((file) => file.replace(/\.json$/, ""))
			.sort();
		const listed = [...manifest.fixtures].sort();
		assert.deepEqual(
			listed,
			onDisk,
			"manifest.fixtures must match the files in tests/fixtures/responses — re-run `npm run record:fixtures`",
		);
	});
});
