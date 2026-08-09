/**
 * Behavioral unit tests for the 5 untested tools in src/tools/users.tools.ts:
 * invite_user, update_user, get_user_invite, delete_user_invite,
 * resend_user_invite. The generic schema/annotation sweeps never invoke
 * these callbacks, so payload assembly and response curation were
 * previously unverified. Follows the stub-service pattern from
 * tests/tools-platform.test.ts and tests/tools-catalog.test.ts.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerUsersTools } from "../src/tools/users.tools.js";
import { registerToolCallbacks } from "./helpers/tool-registry.js";

// ---------------------------------------------------------------------------
// invite_user
// ---------------------------------------------------------------------------

describe("invite_user", () => {
	it("forwards the full invite payload unmodified to the service", async () => {
		let capturedPayload: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerUsersTools(
				server as never,
				{
					users: {
						inviteUser: async (payload: unknown) => {
							capturedPayload = payload;
							return {
								id: "invite_1",
								invite_link: "https://app.portkey.ai/invite/abc123",
							};
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("invite_user");
		assert.ok(cb, "invite_user should be registered");

		const inputPayload = {
			email: "new.user@example.com",
			role: "member" as const,
			first_name: "Ada",
			last_name: "Lovelace",
			workspaces: [{ id: "ws_1", role: "member" as const }],
			workspace_api_key_details: {
				name: "onboarding-key",
				scopes: ["logs.read"],
			},
		};

		const result = (await cb(inputPayload)) as {
			content: Array<{ text: string }>;
		};

		assert.deepEqual(capturedPayload, inputPayload);

		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			message?: string;
			invite_id?: string;
			invite_link?: string;
		};
		assert.equal(payload.invite_id, "invite_1");
		assert.equal(payload.invite_link, "https://app.portkey.ai/invite/abc123");
		assert.match(payload.message ?? "", /new\.user@example\.com/);
		assert.match(payload.message ?? "", /member/);
	});
});

// ---------------------------------------------------------------------------
// update_user
// ---------------------------------------------------------------------------

describe("update_user", () => {
	it("splits user_id out of the payload and returns the formatted user", async () => {
		let capturedUserId: string | undefined;
		let capturedUpdateData: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerUsersTools(
				server as never,
				{
					users: {
						updateUser: async (userId: string, updateData: unknown) => {
							capturedUserId = userId;
							capturedUpdateData = updateData;
							return {
								object: "user",
								id: "user_1",
								first_name: "Grace",
								last_name: "Hopper",
								role: "admin",
								email: "grace@example.com",
								created_at: "2026-01-01T00:00:00.000Z",
								last_updated_at: "2026-01-03T00:00:00.000Z",
							};
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("update_user");
		assert.ok(cb, "update_user should be registered");

		const result = (await cb({
			user_id: "user_1",
			first_name: "Grace",
			last_name: "Hopper",
			role: "admin",
		})) as { content: Array<{ text: string }> };

		assert.equal(capturedUserId, "user_1");
		assert.deepEqual(capturedUpdateData, {
			first_name: "Grace",
			last_name: "Hopper",
			role: "admin",
		});
		// user_id must not leak into the update body sent to the service
		assert.equal(
			(capturedUpdateData as Record<string, unknown>).user_id,
			undefined,
		);

		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			message?: string;
			user?: Record<string, unknown>;
		};
		assert.equal(payload.message, "Successfully updated user");
		// raw envelope field must not leak through formatUser
		assert.equal(payload.user?.object, undefined);
		assert.deepEqual(payload.user, {
			id: "user_1",
			name: "Grace Hopper",
			email: "grace@example.com",
			role: "admin",
			created_at: "2026-01-01T00:00:00.000Z",
			last_updated_at: "2026-01-03T00:00:00.000Z",
		});
	});
});

// ---------------------------------------------------------------------------
// get_user_invite
// ---------------------------------------------------------------------------

describe("get_user_invite", () => {
	it("fetches by invite_id and returns the curated invite shape", async () => {
		let capturedInviteId: string | undefined;
		const callbacks = registerToolCallbacks((server) => {
			registerUsersTools(
				server as never,
				{
					users: {
						getUserInvite: async (inviteId: string) => {
							capturedInviteId = inviteId;
							return {
								id: "invite_1",
								email: "pending@example.com",
								role: "member",
								status: "pending",
								created_at: "2026-01-01T00:00:00.000Z",
								expires_at: "2026-01-08T00:00:00.000Z",
								invite_link: "must-not-leak",
							};
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("get_user_invite");
		assert.ok(cb, "get_user_invite should be registered");

		const result = (await cb({ invite_id: "invite_1" })) as {
			content: Array<{ text: string }>;
		};

		assert.equal(capturedInviteId, "invite_1");
		const payload = JSON.parse(result.content[0]?.text ?? "{}") as Record<
			string,
			unknown
		>;
		assert.equal(payload.invite_link, undefined);
		assert.deepEqual(payload, {
			id: "invite_1",
			email: "pending@example.com",
			role: "member",
			status: "pending",
			created_at: "2026-01-01T00:00:00.000Z",
			expires_at: "2026-01-08T00:00:00.000Z",
		});
	});
});

// ---------------------------------------------------------------------------
// delete_user_invite
// ---------------------------------------------------------------------------

describe("delete_user_invite", () => {
	it("deletes by invite_id and returns a success confirmation", async () => {
		let capturedInviteId: string | undefined;
		let callCount = 0;
		const callbacks = registerToolCallbacks((server) => {
			registerUsersTools(
				server as never,
				{
					users: {
						deleteUserInvite: async (inviteId: string) => {
							callCount += 1;
							capturedInviteId = inviteId;
							return { success: true };
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("delete_user_invite");
		assert.ok(cb, "delete_user_invite should be registered");

		const result = (await cb({ invite_id: "invite_1" })) as {
			content: Array<{ text: string }>;
		};

		assert.equal(callCount, 1);
		assert.equal(capturedInviteId, "invite_1");
		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			message?: string;
			success?: boolean;
		};
		assert.equal(payload.success, true);
		assert.match(payload.message ?? "", /invite_1/);
	});
});

// ---------------------------------------------------------------------------
// resend_user_invite
// ---------------------------------------------------------------------------

describe("resend_user_invite", () => {
	it("resends by invite_id without mutating the invite and returns success", async () => {
		let capturedInviteId: string | undefined;
		let callCount = 0;
		const callbacks = registerToolCallbacks((server) => {
			registerUsersTools(
				server as never,
				{
					users: {
						resendUserInvite: async (inviteId: string) => {
							callCount += 1;
							capturedInviteId = inviteId;
							return { success: true };
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("resend_user_invite");
		assert.ok(cb, "resend_user_invite should be registered");

		const result = (await cb({ invite_id: "invite_1" })) as {
			content: Array<{ text: string }>;
		};

		assert.equal(callCount, 1);
		assert.equal(capturedInviteId, "invite_1");
		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			message?: string;
			success?: boolean;
		};
		assert.equal(payload.success, true);
		assert.match(payload.message ?? "", /invite_1/);
	});
});
