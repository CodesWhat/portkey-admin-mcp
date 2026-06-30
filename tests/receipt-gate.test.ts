/**
 * RR-1 conformance for the opt-in Receipt Required gate on `delete_user`.
 *
 * Proves the four normative behaviors on every push, so the claim can't go
 * stale, and proves the gate stays disabled (no-op) by default:
 *
 *   0. disabled by default -> getDeleteUserGate() returns null
 *   1. missing receipt     -> refused (Receipt Required)
 *   2. valid receipt       -> the action runs
 *   3. replayed receipt    -> refused (one-time consumption)
 *   4. forged receipt      -> refused (signature / action-binding fails)
 *
 * Self-contained: receipts are minted with node:crypto, so no EMILIA backend
 * is involved. Run: `npm test` (tsx --test).
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, describe, it } from "node:test";
import type { EmiliaReceipt } from "../src/lib/receipt-gate.js";
import {
	getDeleteUserGate,
	resetReceiptGatesForTest,
} from "../src/lib/receipt-gate.js";

const USER_ID = "user-123";
const ACTION = `org.users.delete:${USER_ID}`;

// Byte-identical to @emilia-protocol/verify's EP-RECEIPT-v1 canonicalization.
function canonicalize(v: unknown): string {
	if (v === null || v === undefined) return JSON.stringify(v);
	if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
	if (typeof v === "object") {
		const obj = v as Record<string, unknown>;
		return `{${Object.keys(obj)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
			.join(",")}}`;
	}
	return JSON.stringify(v);
}

// Mint a FRESH valid EP-RECEIPT-v1 bound to `action`, signed by a device key.
// (In production this is a real Face ID / passkey signoff.)
function issueReceipt(action: string): EmiliaReceipt {
	const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
	const pub = publicKey
		.export({ type: "spki", format: "der" })
		.toString("base64url");
	const payload = {
		receipt_id: `rcpt_${crypto.randomBytes(6).toString("hex")}`,
		subject: "agent:autonomous",
		created_at: new Date().toISOString(),
		claim: {
			action_type: action,
			outcome: "allow_with_signoff",
			approver: "jane.doe@yourco.example",
		},
	};
	const value = crypto
		.sign(null, Buffer.from(canonicalize(payload), "utf8"), privateKey)
		.toString("base64url");
	return {
		"@version": "EP-RECEIPT-v1",
		payload,
		signature: { algorithm: "Ed25519", value },
		public_key: pub,
	};
}

describe("delete_user Receipt Required gate", () => {
	afterEach(() => {
		process.env.PORTKEY_RECEIPT_REQUIRED_DELETE_USER = undefined;
		resetReceiptGatesForTest();
	});

	it("is disabled by default (no-op, byte-identical behavior)", () => {
		resetReceiptGatesForTest();
		assert.equal(getDeleteUserGate(), null);
	});

	it("RR-1: missing -> refused, valid -> runs, replay -> refused, forged -> refused", async () => {
		process.env.PORTKEY_RECEIPT_REQUIRED_DELETE_USER = "true";
		resetReceiptGatesForTest();
		const gate = getDeleteUserGate();
		assert.ok(gate, "gate should be enabled when opted in");

		let ran = 0;
		const act = () => {
			ran += 1;
		};

		// 1. missing receipt -> refused
		const missing = await gate.run<void>(null, { target: USER_ID }, act);
		assert.equal(missing.ok, false, "missing receipt must be refused");
		assert.equal(ran, 0, "action must not run without a receipt");

		// 2. valid receipt -> runs
		const receipt = issueReceipt(ACTION);
		const valid = await gate.run<void>(receipt, { target: USER_ID }, act);
		assert.equal(valid.ok, true, "valid receipt should run the action");
		assert.equal(ran, 1, "action should have run exactly once");

		// 3. replay -> refused (one-time consumption)
		const replay = await gate.run<void>(receipt, { target: USER_ID }, act);
		assert.equal(replay.ok, false, "replayed receipt must be refused");
		assert.equal(ran, 1, "action must not run again on replay");

		// 4. forged receipt -> refused (signature fails)
		const forged = issueReceipt(ACTION);
		(forged.signature as { value: string }).value = "AAAA";
		const forgedRun = await gate.run<void>(forged, { target: USER_ID }, act);
		assert.equal(forgedRun.ok, false, "forged receipt must be refused");
		assert.equal(ran, 1, "action must not run on a forged receipt");
	});

	it("cross-target binding: a receipt for one user cannot delete another", async () => {
		process.env.PORTKEY_RECEIPT_REQUIRED_DELETE_USER = "true";
		resetReceiptGatesForTest();
		const gate = getDeleteUserGate();
		assert.ok(gate);

		// Receipt authorizes deleting user-123 only.
		const receipt = issueReceipt("org.users.delete:user-123");
		const offTarget = await gate.run<void>(
			receipt,
			{ target: "user-999" },
			() => {},
		);
		assert.equal(
			offTarget.ok,
			false,
			"a receipt for user-123 must not delete user-999",
		);
	});
});
