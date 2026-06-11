/**
 * Contract schemas for Portkey Users API responses.
 * Validated against recorded API fixtures in contract tests.
 */
import { z } from "zod";

// Individual user item in list response
export const PortkeyUserSchema = z.object({
	object: z.string().optional(),
	id: z.string(),
	first_name: z.string(),
	last_name: z.string(),
	role: z.string(),
	email: z.string(),
	created_at: z.string(),
	last_updated_at: z.string(),
});

// GET /admin/users — list envelope
export const ListUsersResponseSchema = z.object({
	total: z.number(),
	object: z.string(),
	data: z.array(PortkeyUserSchema),
});

// Individual user invite
export const UserInviteSchema = z.object({
	id: z.string(),
	email: z.string(),
	role: z.string(),
	status: z.string(),
	created_at: z.string(),
	expires_at: z.string(),
});

// GET /admin/users/invites — list envelope
export const ListUserInvitesResponseSchema = z.object({
	total: z.number(),
	object: z.string(),
	data: z.array(UserInviteSchema),
});

// POST /admin/users/invites — invite response
export const InviteUserResponseSchema = z.object({
	id: z.string(),
	invite_link: z.string(),
});
