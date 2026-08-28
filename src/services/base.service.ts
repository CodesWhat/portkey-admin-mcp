import crypto from "node:crypto";
import {
	buildQueryString,
	FetchError,
	fetchWithTimeout,
	parseErrorResponse,
} from "../lib/fetch.js";
import { Logger } from "../lib/logger.js";

const DEFAULT_BASE_URL = "https://api.portkey.ai/v1";
const DEFAULT_PUBLIC_BASE_URL = "https://api.portkey.ai";

/**
 * Derive the `/v2` sibling of a configured `/v1` base URL.
 *
 * Portkey serves deployments, organisation defaults, and SCIM groups only
 * under `/v2`; the `/v1` paths fall through to the gateway's generic
 * "x-portkey-config or x-portkey-provider header is required" catch-all,
 * which is indistinguishable from a nonexistent route. Swapping the version
 * segment (rather than hardcoding `https://api.portkey.ai/v2`) keeps a
 * self-hosted PORTKEY_BASE_URL working. A base URL that does not end in
 * `/v1` is returned unchanged, since we cannot know how it versions.
 */
function toV2BaseUrl(baseUrl: string): string {
	return baseUrl.replace(/\/v1$/, "/v2");
}

/**
 * Sentinel credential substituted by {@link getSharedPortkeyService} (see
 * src/services/index.ts) when PORTKEY_API_KEY is unset, so the shared
 * service can still complete `initialize`/`tools/list` without credentials.
 * Defined here (rather than in services/index.ts, which imports from this
 * module) so both files can share one constant without an import cycle.
 */
export const MISSING_API_KEY_PLACEHOLDER = "__PORTKEY_API_KEY_NOT_CONFIGURED__";

const PRIVATE_BASE_URL_OVERRIDE_HINT =
	"Set PORTKEY_ALLOW_PRIVATE_BASE_URL=true to allow self-hosted gateways on loopback or private networks.";
const INSECURE_HTTP_OVERRIDE_HINT =
	"Set PORTKEY_ALLOW_INSECURE_HTTP=true only for a trusted self-hosted gateway when TLS is unavailable.";

function parseIpv4(host: string): [number, number, number, number] | null {
	const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!match) {
		return null;
	}
	const parts = match.slice(1).map(Number);
	if (parts.some((part) => part > 255)) {
		return null;
	}
	return parts as [number, number, number, number];
}

function isPrivateIpv4([a, b]: readonly number[]): boolean {
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 100 && b >= 64 && b <= 127)
	);
}

function parseIpv6(host: string): number[] | null {
	let normalized = host;
	if (normalized.includes(".")) {
		const separator = normalized.lastIndexOf(":");
		const ipv4 = parseIpv4(normalized.slice(separator + 1));
		if (separator < 0 || !ipv4) {
			return null;
		}
		normalized = `${normalized.slice(0, separator)}:${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
	}

	const halves = normalized.split("::");
	if (halves.length > 2) {
		return null;
	}
	const parseHalf = (half: string): number[] | null => {
		if (!half) {
			return [];
		}
		const values = half.split(":");
		if (values.some((value) => !/^[0-9a-f]{1,4}$/.test(value))) {
			return null;
		}
		return values.map((value) => Number.parseInt(value, 16));
	};
	const left = parseHalf(halves[0] ?? "");
	const right = parseHalf(halves[1] ?? "");
	if (!left || !right) {
		return null;
	}
	if (halves.length === 1) {
		return left.length === 8 ? left : null;
	}
	const omitted = 8 - left.length - right.length;
	if (omitted < 1) {
		return null;
	}
	return [...left, ...Array.from({ length: omitted }, () => 0), ...right];
}

/**
 * Detect literal loopback / private / link-local hosts so a malicious or
 * misconfigured PORTKEY_BASE_URL cannot turn the outbound client into an SSRF
 * vector against internal services (e.g. cloud metadata at 169.254.169.254).
 * Only literal IP ranges and localhost are blocked — internal DNS names such as
 * `gateway.internal` remain allowed, and PORTKEY_ALLOW_PRIVATE_BASE_URL is an
 * explicit opt-out for self-hosted gateways on literal private addresses.
 */
export function isPrivateOrLocalHost(hostname: string): boolean {
	const host = hostname
		.trim()
		.toLowerCase()
		.replace(/^\[|\]$/g, "");
	if (host === "localhost" || host.endsWith(".localhost")) {
		return true;
	}

	const ipv4 = parseIpv4(host);
	if (ipv4) {
		return isPrivateIpv4(ipv4);
	}

	const ipv6 = parseIpv6(host);
	if (!ipv6) {
		return false;
	}
	if (ipv6.every((part) => part === 0)) {
		return true;
	}
	if (ipv6.slice(0, 7).every((part) => part === 0) && ipv6[7] === 1) {
		return true;
	}
	if ((ipv6[0] & 0xfe00) === 0xfc00 || (ipv6[0] & 0xffc0) === 0xfe80) {
		return true;
	}
	if (ipv6.slice(0, 5).every((part) => part === 0) && ipv6[5] === 0xffff) {
		return isPrivateIpv4([
			ipv6[6] >> 8,
			ipv6[6] & 0xff,
			ipv6[7] >> 8,
			ipv6[7] & 0xff,
		]);
	}
	return false;
}

export function validateUrl(url: string): void {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch (error) {
		if (error instanceof TypeError) {
			throw new Error(`Invalid base URL: ${url}`);
		}
		throw error;
	}

	if (!["http:", "https:"].includes(parsed.protocol)) {
		throw new Error(`Invalid URL protocol: ${parsed.protocol}`);
	}

	const allowPrivate = /^(1|true|yes)$/i.test(
		process.env.PORTKEY_ALLOW_PRIVATE_BASE_URL?.trim() ?? "",
	);
	if (!allowPrivate && isPrivateOrLocalHost(parsed.hostname)) {
		throw new Error(
			`Refusing to use a loopback or private-network PORTKEY_BASE_URL host: ${parsed.hostname}. ${PRIVATE_BASE_URL_OVERRIDE_HINT}`,
		);
	}

	const allowInsecureHttp = /^(1|true|yes)$/i.test(
		process.env.PORTKEY_ALLOW_INSECURE_HTTP?.trim() ?? "",
	);
	if (parsed.protocol === "http:" && !allowInsecureHttp) {
		throw new Error(
			`Refusing insecure HTTP PORTKEY_BASE_URL: ${parsed.origin}. ${INSECURE_HTTP_OVERRIDE_HINT}`,
		);
	}
}

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

interface ExecuteRequestOptions {
	params?: object;
	body?: unknown;
	allowNoContent?: boolean;
	baseUrl?: string;
	authenticate?: boolean;
}

/**
 * Sentinel returned when `allowNoContent` is set and the upstream responds
 * with HTTP 204. A 204 carries no body, so there is no real `T` to hand
 * back — returning this sentinel instead of fabricating `{} as T` means the
 * type system forces every caller to decide what "no content" means for
 * them, rather than silently exposing an object that lies about carrying
 * `T`'s fields.
 */
export const NO_CONTENT = Symbol("NoContent");
export type NoContent = typeof NO_CONTENT;

/** Narrows a `delete<T>()` result away from the {@link NoContent} sentinel. */
export function isNoContent<T>(value: T | NoContent): value is NoContent {
	return value === NO_CONTENT;
}

export class BaseService {
	protected readonly apiKey: string;
	protected readonly baseUrl: string;
	protected readonly v2BaseUrl: string;
	protected readonly timeout: number = 30000;

	constructor(apiKeyOverride?: string, baseUrlOverride?: string) {
		// Use provided API key or fall back to environment variable
		const apiKey = apiKeyOverride ?? process.env.PORTKEY_API_KEY;
		if (!apiKey) {
			throw new Error("PORTKEY_API_KEY environment variable is not set");
		}
		this.apiKey = apiKey;

		const baseUrl =
			baseUrlOverride ?? process.env.PORTKEY_BASE_URL ?? DEFAULT_BASE_URL;
		validateUrl(baseUrl);
		this.baseUrl = baseUrl.replace(/\/+$/, "");
		this.v2BaseUrl = toV2BaseUrl(this.baseUrl);
	}

	protected encodePathSegment(value: string): string {
		return encodeURIComponent(value);
	}

	private buildUrl(
		path: string,
		params?: object,
		baseUrl = this.baseUrl,
	): string {
		return `${baseUrl}${path}${buildQueryString(params)}`;
	}

	private buildHeaders(
		method: HttpMethod,
		authenticate = true,
	): Record<string, string> {
		const headers: Record<string, string> = { Accept: "application/json" };
		if (authenticate) headers["x-portkey-api-key"] = this.apiKey;

		if (method === "POST" || method === "PUT") {
			headers["Content-Type"] = "application/json";
		}

		return headers;
	}

	private serializeBody(body: unknown): string | undefined {
		return body ? JSON.stringify(body) : undefined;
	}

	private async executeRequest<T>(
		method: HttpMethod,
		path: string,
		options: ExecuteRequestOptions = {},
	): Promise<T | NoContent> {
		// The shared service substitutes this placeholder for a missing
		// PORTKEY_API_KEY so startup (initialize/tools/list) can still
		// succeed without credentials. Catch it here, on the first
		// authenticated call, instead of sending it upstream as a real
		// credential — that would just cost a doomed round-trip and surface
		// an opaque 401 instead of telling the caller what to fix.
		if (
			(options.authenticate ?? true) &&
			this.apiKey === MISSING_API_KEY_PLACEHOLDER
		) {
			throw new Error(
				"PORTKEY_API_KEY is not configured. Set the PORTKEY_API_KEY environment variable to a valid Portkey Admin API key.",
			);
		}

		const requestId = crypto.randomUUID();
		const url = this.buildUrl(path, options.params, options.baseUrl);
		const startTime = Date.now();

		// Log only the param keys, never the composed URL — query values can carry
		// sensitive identifiers and should not land in debug logs.
		Logger.debug("HTTP request started", {
			requestId,
			method,
			path,
			metadata: {
				paramKeys: options.params ? Object.keys(options.params) : [],
			},
		});

		try {
			const response = await fetchWithTimeout(url, {
				method,
				redirect: "manual",
				headers: this.buildHeaders(method, options.authenticate),
				body: this.serializeBody(options.body),
				timeout: this.timeout,
			});

			const duration_ms = Date.now() - startTime;

			if (!response.ok) {
				const apiError = await parseErrorResponse(response);
				Logger.error("HTTP request failed", {
					requestId,
					method,
					path,
					statusCode: response.status,
					duration_ms,
					error: apiError.message,
				});
				throw new FetchError(apiError.message, response.status, apiError);
			}

			Logger.info("HTTP request completed", {
				requestId,
				method,
				path,
				statusCode: response.status,
				duration_ms,
			});

			if (options.allowNoContent && response.status === 204) {
				return NO_CONTENT;
			}

			return (await response.json()) as T;
		} catch (error) {
			const duration_ms = Date.now() - startTime;
			// Only log network/system errors (TypeError, AbortError, etc.)
			// FetchError from HTTP failures is already logged above
			if (!(error instanceof FetchError)) {
				Logger.error("HTTP request error", {
					requestId,
					method,
					path,
					duration_ms,
					error: error instanceof Error ? error.message : String(error),
				});
			}
			throw error;
		}
	}

	/**
	 * Asserts that a request known not to set `allowNoContent` never actually
	 * resolves to the {@link NoContent} sentinel. `get`/`post`/`put`/`getPublic`
	 * never pass `allowNoContent`, so `executeRequest` cannot take the 204
	 * branch for them — this only guards against that invariant breaking.
	 */
	private rejectNoContent<T>(result: T | NoContent): T {
		if (isNoContent(result)) {
			throw new Error(
				"Unexpected HTTP 204 No Content response for a request that did not allow it",
			);
		}
		return result;
	}

	protected async get<T>(path: string, params?: object): Promise<T> {
		return this.rejectNoContent(
			await this.executeRequest<T>("GET", path, { params }),
		);
	}

	/** Read an unauthenticated Portkey public-catalog endpoint outside /v1. */
	protected async getPublic<T>(path: string, params?: object): Promise<T> {
		return this.rejectNoContent(
			await this.executeRequest<T>("GET", path, {
				params,
				baseUrl: DEFAULT_PUBLIC_BASE_URL,
				authenticate: false,
			}),
		);
	}

	/** Read a `/v2`-only admin endpoint. See {@link toV2BaseUrl}. */
	protected async getV2<T>(path: string, params?: object): Promise<T> {
		return this.rejectNoContent(
			await this.executeRequest<T>("GET", path, {
				params,
				baseUrl: this.v2BaseUrl,
			}),
		);
	}

	protected async post<T>(path: string, body?: unknown): Promise<T> {
		return this.rejectNoContent(
			await this.executeRequest<T>("POST", path, { body }),
		);
	}

	/** Write to a `/v2`-only admin endpoint. See {@link toV2BaseUrl}. */
	protected async postV2<T>(path: string, body?: unknown): Promise<T> {
		return this.rejectNoContent(
			await this.executeRequest<T>("POST", path, {
				body,
				baseUrl: this.v2BaseUrl,
			}),
		);
	}

	/** Update a `/v2`-only admin endpoint. See {@link toV2BaseUrl}. */
	protected async putV2<T>(path: string, body?: unknown): Promise<T> {
		return this.rejectNoContent(
			await this.executeRequest<T>("PUT", path, {
				body,
				baseUrl: this.v2BaseUrl,
			}),
		);
	}

	protected async put<T>(path: string, body?: unknown): Promise<T> {
		return this.rejectNoContent(
			await this.executeRequest<T>("PUT", path, { body }),
		);
	}

	/**
	 * DELETE responses may legitimately come back as HTTP 204. Callers get
	 * `T | NoContent` back and must narrow with {@link isNoContent} instead of
	 * being handed a fabricated `{}` that silently claims to be a real `T`.
	 */
	protected async delete<T>(
		path: string,
		params?: object,
	): Promise<T | NoContent> {
		return this.executeRequest<T>("DELETE", path, {
			params,
			allowNoContent: true,
		});
	}

	/** Delete on a `/v2`-only admin endpoint. See {@link toV2BaseUrl}. */
	protected async deleteV2<T>(
		path: string,
		params?: object,
	): Promise<T | NoContent> {
		return this.executeRequest<T>("DELETE", path, {
			params,
			allowNoContent: true,
			baseUrl: this.v2BaseUrl,
		});
	}
}
