import { FetchError } from "../src/lib/fetch.js";

const HOSTED_CONTROL_PLANE_GAPS = new Set([
	"listDeployments",
	"listScimGroups",
	"getOrganisationDefaults",
]);

export function expectedSmokeSkipReason(
	name: string,
	error: unknown,
): string | null {
	if (!(error instanceof FetchError)) return null;
	if (error.status === 401 || error.status === 403) {
		return `configured credential lacks access (HTTP ${error.status})`;
	}
	if (
		error.status === 400 &&
		HOSTED_CONTROL_PLANE_GAPS.has(name) &&
		/Either x-portkey-config or x-portkey-provider header is required/i.test(
			error.message,
		)
	) {
		return "documented control-plane route is unavailable on the hosted API";
	}
	return null;
}
