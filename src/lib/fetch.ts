/**
 * HTTP fetch utilities with timeout support
 */

export class FetchError extends Error {
	constructor(
		message: string,
		public status?: number,
		public response?: unknown,
	) {
		super(message);
		this.name = "FetchError";
	}
}

export interface FetchOptions extends RequestInit {
	timeout?: number;
}

/**
 * Fetch with configurable timeout using AbortController
 */
export async function fetchWithTimeout(
	url: string,
	options: FetchOptions = {},
): Promise<Response> {
	const { timeout = 30000, ...fetchOptions } = options;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	try {
		const response = await fetch(url, {
			...fetchOptions,
			signal: controller.signal,
		});
		return response;
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Build query string from params object, filtering undefined values
 */
export function buildQueryString(params?: object): string {
	if (!params) return "";
	const entries = Object.entries(params).filter(
		([_, v]) => v !== undefined && v !== null,
	);
	if (entries.length === 0) return "";
	return (
		"?" +
		new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
	);
}

/**
 * Portkey API error shape returned in non-2xx responses
 */
export interface PortkeyApiError {
	status_code: number;
	message: string;
	slug?: string;
	code?: string;
	type?: string;
}

/**
 * Parse error response from Portkey API, preserving the full error structure.
 * Portkey returns errors as: { status_code, error: { message, slug, code, type }, success: false }
 * or sometimes: { message, ... } at the top level.
 */
export async function parseErrorResponse(
	response: Response,
): Promise<PortkeyApiError> {
	try {
		const body = await response.json();
		// Portkey wraps errors in `error`, `data`, or top-level depending on endpoint
		const err = body.error ?? body.data ?? body ?? {};
		const code = err?.errorCode ?? err?.code;
		return {
			status_code: body?.status_code ?? response.status,
			message:
				err?.message ??
				`HTTP error! status: ${response.status}${code ? ` (${code})` : ""}`,
			slug: err?.slug,
			code,
			type: err?.type,
		};
	} catch {
		return {
			status_code: response.status,
			message: `HTTP error! status: ${response.status}`,
		};
	}
}
