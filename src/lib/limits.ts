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

/**
 * Builds a usage_limits object if any limit parameters are provided.
 * Uses explicit undefined checks to allow setting values to 0.
 * Only includes defined fields to avoid sending undefined values to the API.
 */
export function buildUsageLimits(
	params: UsageLimitsParams,
): Partial<UsageLimits> | undefined {
	if (
		params.credit_limit !== undefined ||
		params.alert_threshold !== undefined
	) {
		const limits: Partial<UsageLimits> = {
			type: params.type ?? "cost",
			periodic_reset: params.periodic_reset ?? PERIODIC_RESET_DEFAULT,
		};
		if (params.credit_limit !== undefined) {
			limits.credit_limit = params.credit_limit;
		}
		if (params.alert_threshold !== undefined) {
			limits.alert_threshold = params.alert_threshold;
		}
		return limits;
	}
	return undefined;
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
