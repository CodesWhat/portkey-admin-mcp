/**
 * Opt-in "Receipt Required" gate for irreversible actions.
 *
 * This wraps the Apache-2.0 reference verifier
 * `@emilia-protocol/require-receipt` so a dangerous tool can be configured to
 * refuse unless it arrives with a verifiable authorization receipt — proof that
 * a named human approved *this exact action*. It is fully offline: no API key,
 * no account, no EMILIA server is trusted.
 *
 *   missing receipt   -> refused (Receipt Required, 428)
 *   valid receipt      -> the action runs (and the receipt is consumed once)
 *   replayed receipt   -> refused (one-time consumption)
 *   forged receipt     -> refused (signature / action-binding fails)
 *
 * OPT-IN AND NON-BREAKING: every gate is disabled unless the operator opts in
 * via an environment variable. With no configuration, `getDeleteUserGate()`
 * returns `null` and callers behave exactly as before.
 *
 * Spec: IETF Internet-Drafts `draft-schrock-ep-authorization-receipts`.
 */
import {
	type EmiliaReceipt,
	makeReceiptGate,
	RECEIPT_REQUIRED_STATUS,
	type ReceiptGate,
} from "@emilia-protocol/require-receipt";

export type { EmiliaReceipt };

/** Manifest URL advertised in the Receipt Required challenge. */
const MANIFEST_URL = "/.well-known/agent-actions.json";

function isEnabled(value: string | undefined): boolean {
	const v = value?.trim().toLowerCase();
	return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Parse a comma/space-separated list of trusted issuer SPKI keys. */
function parseTrustedKeys(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(/[\s,]+/)
		.map((k) => k.trim())
		.filter(Boolean);
}

let deleteUserGate: ReceiptGate | null | undefined;

/**
 * Returns the gate for `delete_user`, or `null` when the operator has not
 * opted in (the default). When enabled, the gate binds each receipt to the
 * specific `user_id` being deleted, so an approval for one user can never
 * authorize deleting another.
 *
 * Enable with `PORTKEY_RECEIPT_REQUIRED_DELETE_USER=true`. In production also
 * set `PORTKEY_RECEIPT_TRUSTED_KEYS` (comma-separated issuer SPKI keys) so a
 * self-signed receipt cannot authorize anything; without it the gate accepts
 * the receipt's own inline key (proves integrity, NOT trust).
 */
export function getDeleteUserGate(): ReceiptGate | null {
	if (deleteUserGate !== undefined) return deleteUserGate;

	if (!isEnabled(process.env.PORTKEY_RECEIPT_REQUIRED_DELETE_USER)) {
		deleteUserGate = null;
		return deleteUserGate;
	}

	const trustedKeys = parseTrustedKeys(
		process.env.PORTKEY_RECEIPT_TRUSTED_KEYS,
	);
	deleteUserGate = makeReceiptGate({
		// Receipt must be bound to "org.users.delete:<user_id>".
		action: (target) => `org.users.delete:${String(target ?? "")}`,
		trustedKeys,
		allowInlineKey: trustedKeys.length === 0,
		statusCode: RECEIPT_REQUIRED_STATUS,
		manifestUrl: MANIFEST_URL,
		assuranceClass: "class_a",
		maxAgeSec: 900,
	});
	return deleteUserGate;
}

/** Test-only: reset the memoized gate so env changes take effect. */
export function resetReceiptGatesForTest(): void {
	deleteUserGate = undefined;
}
