/**
 * Minimal ambient types for the (untyped) Apache-2.0 package
 * `@emilia-protocol/require-receipt`. Only the surface used by
 * `src/lib/receipt-gate.ts` is declared. See the package README for the
 * full API: https://www.npmjs.com/package/@emilia-protocol/require-receipt
 */
declare module "@emilia-protocol/require-receipt" {
	/** HTTP status used for a "Receipt Required" challenge (428). */
	export const RECEIPT_REQUIRED_STATUS: number;

	/** An EP-RECEIPT-v1 document presented by the caller. */
	export type EmiliaReceipt = Record<string, unknown>;

	export interface ReceiptChallenge {
		required: true;
		[key: string]: unknown;
	}

	/** Result of running an action through the gate. */
	export type ReceiptGateResult<T> =
		| {
				ok: true;
				receiptId: string;
				outcome: string;
				signer: string;
				result: T;
		  }
		| {
				ok: false;
				status: number;
				body: ReceiptChallenge & { rejected?: { reason: string } };
		  };

	export interface ReceiptGateOptions {
		/** Canonical action type, or a fn that derives it from the target. */
		action: string | ((target: unknown) => string);
		/** Issuer SPKI keys you trust (recommended in production). */
		trustedKeys?: string[];
		/** Also accept the receipt's own inline key (integrity, NOT trust). */
		allowInlineKey?: boolean;
		/** Max receipt age in seconds. */
		maxAgeSec?: number;
		/** HTTP status to emit on challenge/refusal. */
		statusCode?: number;
		/** Manifest URL advertised in the challenge. */
		manifestUrl?: string;
		/** Assurance class advertised in the challenge. */
		assuranceClass?: string;
		/** Durable one-time-consumption store; defaults to in-memory. */
		store?: { has(id: string): boolean; add(id: string): void };
	}

	export interface ReceiptGate {
		/**
		 * Verify + reserve the receipt, run `fn` (which MUST throw on failure so a
		 * valid approval is not burned), then consume the receipt on success.
		 */
		run<T>(
			receipt: EmiliaReceipt | null | undefined,
			ctx: { target?: unknown },
			fn: () => Promise<T> | T,
		): Promise<ReceiptGateResult<T>>;
	}

	export function makeReceiptGate(opts: ReceiptGateOptions): ReceiptGate;

	export interface ActionRequirement {
		action_type: string;
		receipt_required?: boolean;
		assurance_class?: string;
		max_age_sec?: number;
		[key: string]: unknown;
	}

	export function findActionRequirement(
		manifest: unknown,
		selector: { protocol?: string; tool?: string },
	): ActionRequirement | undefined;
}
