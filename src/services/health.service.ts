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
	protected override readonly timeout = 5000;
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
			await this.get<unknown>("/configs");

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
}
