/**
 * True when a value would act as a "." or ".." path segment once a URL
 * parser sees it. The WHATWG parser treats percent-encoded dots (%2e) as
 * dots, so the check decodes once before comparing.
 */
export function isDotPathSegment(value: string): boolean {
	let decoded = value;
	try {
		decoded = decodeURIComponent(value);
	} catch {
		// Malformed escapes can't form a dot segment; compare the raw value.
	}
	return decoded === "." || decoded === ".." || value === "." || value === "..";
}

/** True when the value is unusable as a single URL path segment. */
export function isInvalidPathSegment(value: string): boolean {
	return value === "" || isDotPathSegment(value);
}
