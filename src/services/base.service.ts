import crypto from "node:crypto";
import {
	buildQueryString,
	FetchError,
	fetchWithTimeout,
	parseErrorResponse,
} from "../lib/fetch.js";
import { Logger } from "../lib/logger.js";

const DEFAULT_BASE_URL = "https://api.portkey.ai/v1";

const PRIVATE_BASE_URL_OVERRIDE_HINT =
	"Set PORTKEY_ALLOW_PRIVATE_BASE_URL=true to allow self-hosted gateways on loopback or private networks.";

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

	let ipv4 = host;
	if (host.includes(":")) {
		// IPv6 literal (URL hostnames never contain ':' for real domains)
		if (host === "::1") {
			return true; // loopback
		}
		if (host.startsWith("fe80:")) {
			return true; // link-local
		}
		if (host.startsWith("fc") || host.startsWith("fd")) {
			return true; // unique local fc00::/7
		}
		if (host.startsWith("::ffff:")) {
			ipv4 = host.slice("::ffff:".length); // IPv4-mapped IPv6
		} else {
			return false;
		}
	}

	const match = ipv4.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!match) {
		return false;
	}
	const a = Number(match[1]);
	const b = Number(match[2]);
	if (a === 0 || a === 10 || a === 127) {
		return true; // this-network, private 10/8, loopback 127/8
	}
	if (a === 169 && b === 254) {
		return true; // link-local incl. cloud metadata 169.254.169.254
	}
	if (a === 172 && b >= 16 && b <= 31) {
		return true; // private 172.16/12
	}
	if (a === 192 && b === 168) {
		return true; // private 192.168/16
	}
	if (a === 100 && b >= 64 && b <= 127) {
		return true; // CGNAT 100.64/10
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
}

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

interface ExecuteRequestOptions {
	params?: object;
	body?: unknown;
	allowNoContent?: boolean;
}

export class BaseService {
	protected readonly apiKey: string;
	protected readonly baseUrl: string;
	protected readonly timeout = 30000;

	constructor(apiKeyOverride?: string) {
		// Use provided API key or fall back to environment variable
		const apiKey = apiKeyOverride ?? process.env.PORTKEY_API_KEY;
		if (!apiKey) {
			throw new Error("PORTKEY_API_KEY environment variable is not set");
		}
		this.apiKey = apiKey;

		// Configurable base URL with validation
		const baseUrl = process.env.PORTKEY_BASE_URL ?? DEFAULT_BASE_URL;
		validateUrl(baseUrl);
		this.baseUrl = baseUrl;
	}

	protected encodePathSegment(value: string): string {
		return encodeURIComponent(value);
	}

	private buildUrl(path: string, params?: object): string {
		return `${this.baseUrl}${path}${buildQueryString(params)}`;
	}

	private buildHeaders(method: HttpMethod): Record<string, string> {
		const headers: Record<string, string> = {
			"x-portkey-api-key": this.apiKey,
			Accept: "application/json",
		};

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
	): Promise<T> {
		const requestId = crypto.randomUUID();
		const url = this.buildUrl(path, options.params);
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
				headers: this.buildHeaders(method),
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
				return {} as T;
			}

			return response.json() as Promise<T>;
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

	protected async get<T>(path: string, params?: object): Promise<T> {
		return this.executeRequest<T>("GET", path, { params });
	}

	protected async post<T>(path: string, body?: unknown): Promise<T> {
		return this.executeRequest<T>("POST", path, { body });
	}

	protected async put<T>(path: string, body?: unknown): Promise<T> {
		return this.executeRequest<T>("PUT", path, { body });
	}

	protected async delete<T>(path: string): Promise<T> {
		return this.executeRequest<T>("DELETE", path, { allowNoContent: true });
	}
}
