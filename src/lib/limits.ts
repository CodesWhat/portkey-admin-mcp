/**
 * Shared utility functions for building usage_limits and rate_limits objects.
 * Centralizes the construction logic to reduce code duplication across tool files.
 */

export const PERIODIC_RESET_DEFAULT = "monthly" as const;

export type PeriodicReset = "monthly" | "weekly";
export type UsageLimitType = "cost" | "tokens";

export interface UsageLimitsParams {
	credit_limit?: number;
	alert_threshold?: number;
	type?: UsageLimitType;
	periodic_reset?: PeriodicReset;
}

export interface UsageLimits {
	type: UsageLimitType;
	credit_limit?: number;
	alert_threshold?: number;
	periodic_reset: PeriodicReset;
}

/**
 * Usage limits as they come back from the API. A resource can carry a reset
 * cadence beyond monthly and weekly, or none at all.
 */
export type ExistingUsageLimits = Omit<
	Partial<UsageLimits>,
	"periodic_reset"
> & {
	periodic_reset?: string | null;
};

export interface RateLimitRpm {
	type: "requests";
	unit: "rpm";
	value: number;
}

export interface RateLimitWithUnit<
	U extends "rpm" | "rph" | "rpd" = "rpm" | "rph" | "rpd",
> {
	type: "requests";
	unit: U;
	value: number;
}

function hasUsageLimitInput(params: UsageLimitsParams): boolean {
	return (
		params.credit_limit !== undefined ||
		params.alert_threshold !== undefined ||
		params.type !== undefined ||
		params.periodic_reset !== undefined
	);
}

function copyDefinedUsageLimitFields(
	params: UsageLimitsParams,
	limits: Partial<UsageLimits>,
): Partial<UsageLimits> {
	if (params.type !== undefined) {
		limits.type = params.type;
	}
	if (params.periodic_reset !== undefined) {
		limits.periodic_reset = params.periodic_reset;
	}
	if (params.credit_limit !== undefined) {
		limits.credit_limit = params.credit_limit;
	}
	if (params.alert_threshold !== undefined) {
		limits.alert_threshold = params.alert_threshold;
	}
	return limits;
}

/**
 * Builds a usage_limits object for a create call if any of the four limit
 * parameters is provided. Omitted type and periodic_reset fall back to the
 * create defaults (cost, monthly).
 * Uses explicit undefined checks to allow setting values to 0.
 * Only includes defined fields to avoid sending undefined values to the API.
 */
export function buildUsageLimits(
	params: UsageLimitsParams,
): Partial<UsageLimits> | undefined {
	if (!hasUsageLimitInput(params)) {
		return undefined;
	}
	return copyDefinedUsageLimitFields(params, {
		type: "cost",
		periodic_reset: PERIODIC_RESET_DEFAULT,
	});
}

/**
 * Builds a usage_limits object for an update call. Unlike the create builder it
 * applies no defaults, so a field the caller didn't supply is never invented.
 */
export function buildUsageLimitsUpdate(
	params: UsageLimitsParams,
): Partial<UsageLimits> | undefined {
	if (!hasUsageLimitInput(params)) {
		return undefined;
	}
	return copyDefinedUsageLimitFields(params, {});
}

/**
 * Merges the usage-limit fields an update supplies onto the limits a resource
 * already has, so changing the alert threshold doesn't reset the type, credit
 * limit or cadence. The existing limits are read only when the update supplies
 * at least one limit field. A resource with no limits yet gets the create
 * defaults for whatever the caller leaves out.
 */
export async function mergeUsageLimitsUpdate(
	supplied: Partial<UsageLimits> | undefined,
	readExisting: () => Promise<ExistingUsageLimits | null | undefined>,
): Promise<ExistingUsageLimits | undefined> {
	if (supplied === undefined) {
		return undefined;
	}
	const existing = await readExisting();
	const base: ExistingUsageLimits = existing
		? {}
		: { type: "cost", periodic_reset: PERIODIC_RESET_DEFAULT };
	if (existing) {
		for (const key of [
			"type",
			"credit_limit",
			"alert_threshold",
			"periodic_reset",
		] as const) {
			if (existing[key] !== undefined) {
				Object.assign(base, { [key]: existing[key] });
			}
		}
	}
	return { ...base, ...supplied };
}

/**
 * Builds a rate_limits array for RPM-only rate limits.
 * Convenience function for the common case where only rpm is used.
 */
export function buildRateLimitsRpm(
	rpmValue: number | undefined,
): RateLimitRpm[] | undefined {
	if (rpmValue !== undefined) {
		return [
			{
				type: "requests",
				unit: "rpm",
				value: rpmValue,
			},
		];
	}
	return undefined;
}

/**
 * Builds a rate_limits array with a configurable unit.
 * Used by providers which support rpm, rph, and rpd.
 */
export function buildRateLimits<U extends "rpm" | "rph" | "rpd">(params: {
	value: number;
	unit: U;
}): RateLimitWithUnit<U>[] {
	return [
		{
			type: "requests",
			unit: params.unit,
			value: params.value,
		},
	];
}
