import { FetchError } from "../src/lib/fetch.js";

export const UPSTREAM_UNAVAILABLE_PREFIX = "Portkey upstream unavailable";

export function expectedSmokeSkipReason(
	name: string,
	error: unknown,
): string | null {
	void name;
	// Services such as HealthService wrap the FetchError in a plain Error, so
	// look one level down the cause chain.
	const fetchError =
		error instanceof FetchError
			? error
			: error instanceof Error && error.cause instanceof FetchError
				? error.cause
				: null;
	if (!fetchError) return null;
	if (fetchError.status === 401 || fetchError.status === 403) {
		return `configured credential lacks access (HTTP ${fetchError.status})`;
	}
	if (
		fetchError.status === 502 ||
		fetchError.status === 503 ||
		fetchError.status === 504
	) {
		return `${UPSTREAM_UNAVAILABLE_PREFIX} (HTTP ${fetchError.status})`;
	}
	return null;
}

export function smokeExitCode(counts: {
	passed: number;
	failed: number;
	total: number;
}): 0 | 1 {
	if (counts.failed > 0) return 1;
	if (counts.total > 0 && counts.passed === 0) return 1;
	return 0;
}
