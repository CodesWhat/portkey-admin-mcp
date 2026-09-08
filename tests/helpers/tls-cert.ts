import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// TLS-dependent tests shell out to `openssl` to mint a throwaway cert. openssl
// isn't guaranteed on every machine (or CI image), so probe for it once and
// skip the tests that need it where it's absent rather than failing the suite
// on a missing system binary.
function hasOpenssl(): boolean {
	try {
		execFileSync("openssl", ["version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

export const OPENSSL_AVAILABLE = hasOpenssl();

// On CI, TLS-dependent tests are the only HTTP-layer proof of this behavior,
// so a missing openssl there is a broken runner image and must fail loudly
// instead of quietly skipping it.
if (process.env.CI && !OPENSSL_AVAILABLE) {
	throw new Error(
		"openssl is required on CI: TLS-dependent tests must not be skipped",
	);
}

export function generateSelfSignedCert(): { key: string; cert: string } {
	const dir = mkdtempSync(join(tmpdir(), "portkey-mcp-jwks-cert-"));
	try {
		const keyPath = join(dir, "key.pem");
		const certPath = join(dir, "cert.pem");
		execFileSync("openssl", [
			"req",
			"-x509",
			"-newkey",
			"rsa:2048",
			"-nodes",
			"-keyout",
			keyPath,
			"-out",
			certPath,
			"-days",
			"1",
			"-subj",
			"/CN=127.0.0.1",
		]);
		return {
			key: readFileSync(keyPath, "utf8"),
			cert: readFileSync(certPath, "utf8"),
		};
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

export function writeSelfSignedCertFiles(): {
	certPath: string;
	keyPath: string;
	cleanup: () => void;
} {
	const dir = mkdtempSync(join(tmpdir(), "portkey-mcp-tls-cert-"));
	const { key, cert } = generateSelfSignedCert();
	const certPath = join(dir, "cert.pem");
	const keyPath = join(dir, "key.pem");
	writeFileSync(certPath, cert);
	writeFileSync(keyPath, key);
	return {
		certPath,
		keyPath,
		cleanup: () => {
			rmSync(dir, { recursive: true, force: true });
		},
	};
}
