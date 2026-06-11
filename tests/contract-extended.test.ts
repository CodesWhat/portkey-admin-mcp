/**
 * Extended Contract Tests — Workspaces and Users API domains.
 *
 * Validates Zod schemas for the workspaces and users domains against
 * recorded API fixtures (where available). The users fixture may be absent
 * if the API key does not have admin/org-owner permissions (HTTP 403);
 * those tests skip gracefully rather than failing.
 *
 * Run with: npx tsx --test tests/contract-extended.test.ts
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
	InviteUserResponseSchema,
	ListUserInvitesResponseSchema,
	ListUsersResponseSchema,
	PortkeyUserSchema,
	UserInviteSchema,
} from "../src/schemas/contracts/users.contract.js";
import {
	CreateWorkspaceResponseSchema,
	GetWorkspaceResponseSchema,
	ListWorkspacesResponseSchema,
	WorkspaceItemSchema,
	WorkspaceUserSchema,
} from "../src/schemas/contracts/workspaces.contract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures", "responses");

function loadFixture(name: string): unknown {
	const filePath = join(FIXTURES_DIR, `${name}.json`);
	return JSON.parse(readFileSync(filePath, "utf-8"));
}

function fixtureExists(name: string): boolean {
	return existsSync(join(FIXTURES_DIR, `${name}.json`));
}

// ==================== Workspaces ====================

describe("Contract: Workspaces API", () => {
	it("ListWorkspacesResponse schema parses workspaces-list fixture", () => {
		const fixture = loadFixture("workspaces-list");
		const result = ListWorkspacesResponseSchema.safeParse(fixture);
		assert.ok(
			result.success,
			`Schema validation failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
		);
		assert.ok(
			result.data.data.length > 0,
			"Should have at least one workspace",
		);
		assert.equal(result.data.object, "list");
	});

	it("WorkspaceItem schema parses individual workspace from fixture", () => {
		const fixture = loadFixture("workspaces-list") as { data: unknown[] };
		const first = fixture.data[0];
		const result = WorkspaceItemSchema.safeParse(first);
		assert.ok(
			result.success,
			`Schema validation failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
		);
		assert.ok(typeof result.data.id === "string", "id must be a string");
		assert.ok(typeof result.data.name === "string", "name must be a string");
		assert.ok(typeof result.data.slug === "string", "slug must be a string");
	});

	it("WorkspaceItem schema validates all items in list fixture", () => {
		const fixture = loadFixture("workspaces-list") as { data: unknown[] };
		for (let i = 0; i < fixture.data.length; i++) {
			const result = WorkspaceItemSchema.safeParse(fixture.data[i]);
			assert.ok(
				result.success,
				`Item ${i} failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
			);
		}
	});

	it("GetWorkspaceResponse schema parses workspaces-get fixture", () => {
		const fixture = loadFixture("workspaces-get");
		const result = GetWorkspaceResponseSchema.safeParse(fixture);
		assert.ok(
			result.success,
			`Schema validation failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
		);
		assert.ok(typeof result.data.id === "string", "id must be a string");
	});

	it("GetWorkspaceResponse fixture includes users array with valid members", () => {
		const fixture = loadFixture("workspaces-get") as {
			users?: unknown[];
		};
		assert.ok(
			Array.isArray(fixture.users),
			"workspaces-get fixture should include a users array",
		);
		for (let i = 0; i < (fixture.users ?? []).length; i++) {
			const result = WorkspaceUserSchema.safeParse((fixture.users ?? [])[i]);
			assert.ok(
				result.success,
				`User ${i} failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
			);
		}
	});

	it("CreateWorkspaceResponse schema validates expected shape", () => {
		const synthetic = {
			id: "6e5a9f93-ae3a-46b4-a87d-2464d373ef7e",
			name: "Test Workspace",
			slug: "test-workspace-abc",
			description: null,
			created_at: "2026-01-01T00:00:00.000Z",
			last_updated_at: "2026-01-01T00:00:00.000Z",
			defaults: null,
			object: "workspace" as const,
		};
		const result = CreateWorkspaceResponseSchema.safeParse(synthetic);
		assert.ok(result.success, "CreateWorkspaceResponse should parse");
	});
});

// ==================== Users ====================
// The /admin/users endpoint requires org-owner or admin permissions.
// If the fixture is absent (recorded as 403), these tests skip gracefully.

describe("Contract: Users API", () => {
	it("ListUsersResponse schema parses users-list fixture (skips if fixture absent)", () => {
		if (!fixtureExists("users-list")) {
			// Fixture was not recorded — API key lacked org-level permission (HTTP 403).
			// Test is intentionally skipped rather than failing.
			console.log(
				"  [skip] users-list fixture not present — API key lacks org-admin permission",
			);
			return;
		}
		const fixture = loadFixture("users-list");
		const result = ListUsersResponseSchema.safeParse(fixture);
		assert.ok(
			result.success,
			`Schema validation failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
		);
		assert.ok(typeof result.data.total === "number", "total must be a number");
		assert.ok(Array.isArray(result.data.data), "data must be an array");
	});

	it("PortkeyUser schema parses individual user from fixture (skips if fixture absent)", () => {
		if (!fixtureExists("users-list")) {
			console.log(
				"  [skip] users-list fixture not present — API key lacks org-admin permission",
			);
			return;
		}
		const fixture = loadFixture("users-list") as { data: unknown[] };
		for (let i = 0; i < fixture.data.length; i++) {
			const result = PortkeyUserSchema.safeParse(fixture.data[i]);
			assert.ok(
				result.success,
				`User ${i} failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
			);
		}
	});

	it("ListUsersResponse schema validates expected synthetic shape", () => {
		const synthetic = {
			total: 2,
			object: "list",
			data: [
				{
					object: "user",
					id: "user-001",
					first_name: "Ada",
					last_name: "Lovelace",
					role: "admin",
					email: "ada@example.com",
					created_at: "2026-01-01T00:00:00.000Z",
					last_updated_at: "2026-01-02T00:00:00.000Z",
				},
				{
					object: "user",
					id: "user-002",
					first_name: "Grace",
					last_name: "Hopper",
					role: "member",
					email: "grace@example.com",
					created_at: "2026-01-03T00:00:00.000Z",
					last_updated_at: "2026-01-04T00:00:00.000Z",
				},
			],
		};
		const result = ListUsersResponseSchema.safeParse(synthetic);
		assert.ok(
			result.success,
			`Schema validation failed: ${JSON.stringify(result.error?.issues, null, 2)}`,
		);
		assert.equal(result.data.total, 2);
		assert.equal(result.data.data.length, 2);
	});

	it("PortkeyUser schema validates required fields", () => {
		const synthetic = {
			object: "user",
			id: "user-001",
			first_name: "Ada",
			last_name: "Lovelace",
			role: "admin",
			email: "ada@example.com",
			created_at: "2026-01-01T00:00:00.000Z",
			last_updated_at: "2026-01-02T00:00:00.000Z",
		};
		const result = PortkeyUserSchema.safeParse(synthetic);
		assert.ok(result.success, "PortkeyUser should parse");
		assert.equal(result.data.id, "user-001");
		assert.equal(result.data.email, "ada@example.com");
	});

	it("PortkeyUser schema rejects missing required email field", () => {
		const invalid = {
			object: "user",
			id: "user-001",
			first_name: "Ada",
			last_name: "Lovelace",
			role: "admin",
			// email is intentionally omitted
			created_at: "2026-01-01T00:00:00.000Z",
			last_updated_at: "2026-01-02T00:00:00.000Z",
		};
		const result = PortkeyUserSchema.safeParse(invalid);
		assert.ok(
			!result.success,
			"PortkeyUser should reject when email is missing",
		);
	});

	it("UserInvite schema validates expected shape", () => {
		const synthetic = {
			id: "invite-001",
			email: "newuser@example.com",
			role: "member",
			status: "pending",
			created_at: "2026-01-01T00:00:00.000Z",
			expires_at: "2026-01-08T00:00:00.000Z",
		};
		const result = UserInviteSchema.safeParse(synthetic);
		assert.ok(result.success, "UserInvite should parse");
	});

	it("ListUserInvitesResponse schema validates expected shape", () => {
		const synthetic = {
			total: 1,
			object: "list",
			data: [
				{
					id: "invite-001",
					email: "newuser@example.com",
					role: "member",
					status: "pending",
					created_at: "2026-01-01T00:00:00.000Z",
					expires_at: "2026-01-08T00:00:00.000Z",
				},
			],
		};
		const result = ListUserInvitesResponseSchema.safeParse(synthetic);
		assert.ok(result.success, "ListUserInvitesResponse should parse");
	});

	it("InviteUserResponse schema validates expected shape", () => {
		const synthetic = {
			id: "invite-001",
			invite_link: "https://app.portkey.ai/invite/abc123",
		};
		const result = InviteUserResponseSchema.safeParse(synthetic);
		assert.ok(result.success, "InviteUserResponse should parse");
	});
});
