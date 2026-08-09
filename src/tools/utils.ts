import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { isRecord } from "../lib/type-guards.js";

export function formatFullName(firstName?: string, lastName?: string): string {
	return [firstName, lastName].filter(Boolean).join(" ").trim();
}

/**
 * Build a standard single-text-block CallToolResult from arbitrary JSON-serializable
 * data. Replaces the hand-rolled `{ content: [{ type: "text", text: JSON.stringify(x) }] }`
 * envelope that was previously duplicated across every tool handler.
 *
 * When data is a plain object, it is also attached as structuredContent so
 * wrapToolCallback's normalizeToolResult (src/tools/index.ts) can build the
 * final ok/data envelope directly from it instead of re-parsing the
 * JSON-stringified text back out. This is purely an internal signal consumed
 * before the result crosses the wire: normalizeToolResult always replaces
 * structuredContent with the final envelope before returning, so nothing
 * observable changes when data isn't a plain object (arrays, strings, etc.
 * fall back to the previous parse-from-text behavior).
 */
export function jsonResult(data: unknown): CallToolResult {
	// JSON.stringify returns undefined for a top-level undefined, function, or
	// symbol. Fall back to "null" so text is always a string, matching the null
	// that normalizeToolResult already substitutes for a missing payload.
	const serialized = JSON.stringify(data) ?? "null";

	return {
		content: [{ type: "text", text: serialized }],
		...(isRecord(data) && !Array.isArray(data)
			? { structuredContent: data as Record<string, unknown> }
			: {}),
	};
}
