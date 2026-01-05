import { BaseService } from "./base.service.js";

export interface HealthCheckResult {
	status: "ok" | "error";
	latency_ms: number;
	cached?: boolean;
	error?: string;
}

interface CachedHealth {
	result: HealthCheckResult;
	timestamp: number;
}

const CACHE_TTL_MS = 10000; // 10 seconds

export class HealthService extends BaseService {
	private cachedHealth: CachedHealth | null = null;

	/**
	 * Ping the Portkey API to check health
	 * Calls GET /configs with a 5s timeout
	 * Results are cached for 10 seconds
	 */
	async ping(): Promise<HealthCheckResult> {
		// Check cache
		if (this.cachedHealth) {
			const age = Date.now() - this.cachedHealth.timestamp;
			if (age < CACHE_TTL_MS) {
				return {
					...this.cachedHealth.result,
					cached: true,
				};
			}
		}

		const startTime = Date.now();

		try {
			// Override timeout to 5s for health check
			await this.getWithTimeout<unknown>("/configs", 5000);

			const latency_ms = Date.now() - startTime;
			const result: HealthCheckResult = {
				status: "ok",
				latency_ms,
			};

			// Cache successful result
			this.cachedHealth = {
				result,
				timestamp: Date.now(),
			};

			return result;
		} catch (error) {
			const latency_ms = Date.now() - startTime;
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";

			// Don't cache errors
			throw new Error(`Health check failed: ${errorMessage} (${latency_ms}ms)`);
		}
	}

	/**
	 * Internal method to call GET with custom timeout
	 */
	private async getWithTimeout<T>(path: string, timeout: number): Promise<T> {
		const url = `${this.baseUrl}${path}`;

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			const response = await fetch(url, {
				method: "GET",
				headers: {
					"x-portkey-api-key": this.apiKey,
					Accept: "application/json",
				},
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			return response.json() as Promise<T>;
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				throw new Error(`Request timed out after ${timeout}ms`);
			}
			throw error;
		} finally {
			clearTimeout(timeoutId);
		}
	}
}
