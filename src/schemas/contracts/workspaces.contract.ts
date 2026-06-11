/**
 * Contract schemas for Portkey Workspaces API responses.
 * Validated against recorded API fixtures in contract tests.
 */
import { z } from "zod";

// Workspace defaults sub-object
export const WorkspaceDefaultsSchema = z.object({
	is_default: z.number().optional(),
	metadata: z.record(z.string(), z.string()).optional(),
	object: z.literal("workspace").optional(),
});

// Individual workspace item in list response
// Uses passthrough to tolerate extra fields (icon, security_settings, etc.)
export const WorkspaceItemSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		slug: z.string(),
		description: z.string().nullable().optional(),
		created_at: z.string(),
		last_updated_at: z.string(),
		defaults: WorkspaceDefaultsSchema.nullable().optional(),
		is_default: z.number().optional(),
		status: z.string().optional(),
		object: z.literal("workspace"),
	})
	.passthrough();

// GET /admin/workspaces — list envelope
export const ListWorkspacesResponseSchema = z.object({
	total: z.number(),
	object: z.literal("list"),
	data: z.array(WorkspaceItemSchema),
});

// Workspace member / user sub-object in single workspace response
export const WorkspaceUserSchema = z
	.object({
		id: z.string(),
		first_name: z.string(),
		last_name: z.string(),
		org_role: z.string().optional(),
		role: z.string(),
		status: z.string().optional(),
		created_at: z.string(),
		last_updated_at: z.string(),
	})
	.passthrough();

// GET /admin/workspaces/:id — single workspace with members
// Uses passthrough to tolerate extra fields (settings, organisation_id, etc.)
export const GetWorkspaceResponseSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		slug: z.string(),
		description: z.string().nullable().optional(),
		created_at: z.string(),
		last_updated_at: z.string(),
		defaults: WorkspaceDefaultsSchema.nullable().optional(),
		object: z.literal("workspace").optional(),
		users: z.array(WorkspaceUserSchema).optional(),
	})
	.passthrough();

// POST /admin/workspaces — create response
export const CreateWorkspaceResponseSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		slug: z.string(),
		description: z.string().nullable().optional(),
		created_at: z.string(),
		last_updated_at: z.string(),
		defaults: WorkspaceDefaultsSchema.nullable().optional(),
		object: z.literal("workspace"),
	})
	.passthrough();
