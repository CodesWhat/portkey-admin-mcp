import crypto from "node:crypto";
import {
	buildQueryString,
	FetchError,
	fetchWithTimeout,
	parseErrorResponse,
} from "../lib/fetch.js";
import { Logger } from "../lib/logger.js";

const DEFAULT_BASE_URL = "https://api.portkey.ai/v1";

function validateUrl(url: string): void {
	try {
		const parsed = new URL(url);
		if (!["http:", "https:"].includes(parsed.protocol)) {
			throw new Error(`Invalid URL protocol: ${parsed.protocol}`);
		}
	} catch (error) {
		if (error instanceof TypeError) {
			throw new Error(`Invalid base URL: ${url}`);
		}
		throw error;
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

		Logger.debug("HTTP request started", {
			requestId,
			method,
			path,
			metadata: { url },
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
