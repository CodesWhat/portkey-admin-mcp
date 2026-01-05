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
 * Parse error response from API
 */
export async function parseErrorResponse(response: Response): Promise<string> {
	try {
		const error = await response.json();
		return error.message || `HTTP error! status: ${response.status}`;
	} catch {
		return `HTTP error! status: ${response.status}`;
	}
}
