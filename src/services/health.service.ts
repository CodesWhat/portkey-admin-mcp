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
const FAILURE_RETRY_MS = 1000;

export class HealthService extends BaseService {
	protected override readonly timeout = 5000;
	private cachedHealth: CachedHealth | null = null;
	private cachedFailure: { error: Error; timestamp: number } | null = null;
	private inFlight: Promise<HealthCheckResult> | null = null;

	/**
	 * Ping the Portkey API to check health
	 * Calls GET /configs with a 5s timeout
	 * Results are cached for 10 seconds
	 */
	async ping(): Promise<HealthCheckResult> {
		if (this.cachedHealth) {
			const age = Date.now() - this.cachedHealth.timestamp;
			if (age < CACHE_TTL_MS) {
				return {
					...this.cachedHealth.result,
					cached: true,
				};
			}
		}
		if (
			this.cachedFailure &&
			Date.now() - this.cachedFailure.timestamp < FAILURE_RETRY_MS
		) {
			throw this.cachedFailure.error;
		}
		if (this.inFlight) {
			return this.inFlight;
		}

		const probe = this.probe();
		this.inFlight = probe;
		try {
			return await probe;
		} finally {
			if (this.inFlight === probe) {
				this.inFlight = null;
			}
		}
	}

	private async probe(): Promise<HealthCheckResult> {
		const startTime = Date.now();

		try {
			await this.get<unknown>("/configs");

			const latency_ms = Date.now() - startTime;
			const result: HealthCheckResult = {
				status: "ok",
				latency_ms,
			};

			this.cachedHealth = {
				result,
				timestamp: Date.now(),
			};
			this.cachedFailure = null;

			return result;
		} catch (error) {
			const latency_ms = Date.now() - startTime;
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";

			const healthError = new Error(
				`Health check failed: ${errorMessage} (${latency_ms}ms)`,
			);
			this.cachedFailure = {
				error: healthError,
				timestamp: Date.now(),
			};
			throw healthError;
		}
	}
}
