import { FetchError } from "../src/lib/fetch.js";

export const UPSTREAM_UNAVAILABLE_PREFIX = "Portkey upstream unavailable";

export function expectedSmokeSkipReason(
	name: string,
	error: unknown,
): string | null {
	void name;
	if (!(error instanceof FetchError)) return null;
	if (error.status === 401 || error.status === 403) {
		return `configured credential lacks access (HTTP ${error.status})`;
	}
	if (error.status === 502 || error.status === 503 || error.status === 504) {
		return `${UPSTREAM_UNAVAILABLE_PREFIX} (HTTP ${error.status})`;
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
