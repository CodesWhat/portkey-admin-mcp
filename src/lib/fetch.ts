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

export const DEFAULT_MAX_UPSTREAM_BODY_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MAX_TOOL_RESULT_BYTES = 4 * 1024 * 1024;
const MAX_CONFIGURABLE_BYTES = 1024 * 1024 * 1024;

export const MAX_UPSTREAM_BODY_BYTES_ENV = "PORTKEY_MAX_UPSTREAM_BODY_BYTES";
export const MAX_TOOL_RESULT_BYTES_ENV = "PORTKEY_MAX_TOOL_RESULT_BYTES";

/**
 * Read a byte limit from the environment. Unset or blank uses the default;
 * anything that is not a positive integer up to 1 GiB throws instead of
 * silently falling back, so a typo can't quietly disable the cap.
 */
export function resolveByteLimit(envName: string, fallback: number): number {
	const raw = process.env[envName]?.trim();
	if (!raw) return fallback;
	const parsed = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
	if (
		!Number.isSafeInteger(parsed) ||
		parsed < 1 ||
		parsed > MAX_CONFIGURABLE_BYTES
	) {
		throw new Error(
			`Invalid ${envName} value: ${raw}. Must be a positive integer number of bytes (1-${MAX_CONFIGURABLE_BYTES})`,
		);
	}
	return parsed;
}

export function getMaxUpstreamBodyBytes(): number {
	return resolveByteLimit(
		MAX_UPSTREAM_BODY_BYTES_ENV,
		DEFAULT_MAX_UPSTREAM_BODY_BYTES,
	);
}

export function getMaxToolResultBytes(): number {
	return resolveByteLimit(
		MAX_TOOL_RESULT_BYTES_ENV,
		DEFAULT_MAX_TOOL_RESULT_BYTES,
	);
}

/** Fail at startup, not on the first request, when a byte limit is malformed. */
export function assertByteLimitsConfigured(): void {
	getMaxUpstreamBodyBytes();
	getMaxToolResultBytes();
}

/** Thrown when a response body is larger than the configured limit. */
export class ResponseBodyTooLargeError extends Error {
	constructor(public readonly limit: number) {
		super(`Response body is larger than the ${limit}-byte limit`);
		this.name = "ResponseBodyTooLargeError";
	}
}

/**
 * Read a response body as UTF-8 text, counting the bytes actually received
 * rather than trusting Content-Length. The stream is cancelled as soon as the
 * count passes `maxBytes`, so an oversized or endless body is never buffered.
 */
export async function readBoundedText(
	response: Response,
	maxBytes: number,
): Promise<string> {
	if (!response.body) return "";
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			received += value.byteLength;
			if (received > maxBytes) {
				await reader.cancel().catch(() => undefined);
				throw new ResponseBodyTooLargeError(maxBytes);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Bounded equivalent of `response.json()`. */
export async function readBoundedJson<T = unknown>(
	response: Response,
	maxBytes: number,
): Promise<T> {
	return JSON.parse(await readBoundedText(response, maxBytes)) as T;
}

export interface FetchOptions extends RequestInit {
	timeout?: number;
}

/**
 * Fetch with a configurable deadline that remains active while the response
 * body is consumed.
 */
export async function fetchWithTimeout(
	url: string,
	options: FetchOptions = {},
): Promise<Response> {
	const { timeout = 30000, ...fetchOptions } = options;
	return fetch(url, {
		...fetchOptions,
		signal: AbortSignal.timeout(timeout),
	});
}

/**
 * Build query string from params object, filtering undefined values
 */
export function buildQueryString(params?: object): string {
	if (!params) return "";
	const entries = Object.entries(params).flatMap(([key, value]) => {
		if (value === undefined || value === null) return [];
		if (Array.isArray(value)) {
			return value.map((item) => [key, String(item)] as [string, string]);
		}
		return [[key, String(value)] as [string, string]];
	});
	if (entries.length === 0) return "";
	return `?${new URLSearchParams(entries).toString()}`;
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

interface ErrorFields {
	message?: string;
	slug?: string;
	code?: string;
	errorCode?: string;
	type?: string;
}

interface ErrorBody extends ErrorFields {
	status_code?: number;
	error?: ErrorFields;
	data?: ErrorFields;
}

/**
 * Parse error response from Portkey API, preserving the full error structure.
 * Portkey returns errors as: { status_code, error: { message, slug, code, type }, success: false }
 * or sometimes: { message, ... } at the top level.
 */
export async function parseErrorResponse(
	response: Response,
	maxBytes = DEFAULT_MAX_UPSTREAM_BODY_BYTES,
): Promise<PortkeyApiError> {
	try {
		const body = await readBoundedJson<ErrorBody>(response, maxBytes);
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
	} catch (error) {
		return {
			status_code: response.status,
			message:
				error instanceof ResponseBodyTooLargeError
					? `HTTP error! status: ${response.status} (error body over the ${maxBytes}-byte limit)`
					: `HTTP error! status: ${response.status}`,
		};
	}
}
