import { FetchError } from "../src/lib/fetch.js";

export function expectedSmokeSkipReason(
	name: string,
	error: unknown,
): string | null {
	void name;
	if (!(error instanceof FetchError)) return null;
	if (error.status === 401 || error.status === 403) {
		return `configured credential lacks access (HTTP ${error.status})`;
	}
	return null;
}
