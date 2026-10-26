import assert from "node:assert/strict";
import {
	Agent,
	createServer,
	request as httpRequest,
	type Server,
} from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express from "express";
import {
	isHealthOrReadyPath,
	isMcpRequestPath,
} from "../src/lib/request-path.js";

// Differential test: the auth gate and the probe skips decide with
// request-path.ts, while Express decides which handler runs. This sends raw
// paths to a minimal app using the same router defaults as http-app.ts (a
// plain `express()` with no strict or case-sensitive routing) and checks the
// classifiers never disagree with the router in an unsafe direction.

type Method = "GET" | "POST";
type Observation = {
	rawPath: string;
	method: Method;
	route: "mcp" | "health" | "ready" | "none";
	reqPath: string;
	isMcp: boolean;
	isProbe: boolean;
};

const BASES = ["/mcp", "/health", "/ready"] as const;
const SUFFIXES = [
	"",
	"/",
	"//",
	"/.",
	"/./",
	";x",
	";",
	"?q=1",
	"#frag",
	"%00",
	"%20",
	"%2f",
	"%2F",
	"/%2f",
	".",
	"/extra",
];

function casePermutations(word: string): string[] {
	const out: string[] = [];
	for (let mask = 0; mask < 1 << word.length; mask++) {
		out.push(
			[...word]
				.map((ch, i) => (mask & (1 << i) ? ch.toUpperCase() : ch))
				.join(""),
		);
	}
	return out;
}

function percentEncodeLetter(word: string, index: number, upperHex: boolean) {
	const hex = word.charCodeAt(index).toString(16);
	const encoded = `%${upperHex ? hex.toUpperCase() : hex}`;
	return word.slice(0, index) + encoded + word.slice(index + 1);
}

function buildCorpus(): string[] {
	const paths = new Set<string>();
	for (const base of BASES) {
		const word = base.slice(1);
		const permutations = casePermutations(word);
		// Every case permutation with the two slash forms Express tolerates.
		for (const w of permutations) {
			for (const suffix of ["", "/"]) {
				paths.add(`/${w}${suffix}`);
			}
		}
		// A few representative case forms against every suffix and prefix.
		for (const w of [word, word.toUpperCase(), permutations[5] ?? word]) {
			for (const suffix of SUFFIXES) {
				paths.add(`/${w}${suffix}`);
				paths.add(`//${w}${suffix}`);
			}
			paths.add(`/x/../${w}`);
			paths.add(`/./${w}`);
			paths.add(`/${w}/../${w}`);
			paths.add(`/%2e%2e/${w}`);
		}
		// Percent-encode each single letter, both hex cases, both letter cases.
		for (const w of [word, word.toUpperCase()]) {
			for (let i = 0; i < w.length; i++) {
				for (const upperHex of [false, true]) {
					const encoded = percentEncodeLetter(w, i, upperHex);
					paths.add(`/${encoded}`);
					paths.add(`/${encoded}/`);
				}
			}
		}
		// Unicode lookalikes (Cyrillic, fullwidth, dotless i, Kelvin sign).
		paths.add(`/${word.replace(/m/, "%D0%BC")}`);
		paths.add(`/${word.replace(/e/, "%D0%B5")}`);
		paths.add(`/${word.replace(/a/, "%D0%B0")}`);
		paths.add(`/${word.replace(/p/, "%D1%80")}`);
		paths.add(`/${word.replace(/h/, "%EF%BD%88")}`);
		paths.add(`/${word.replace(/l/, "%C4%B1")}`);
		paths.add(`/${word.replace(/k/, "%E2%84%AA")}`);
		paths.add(`/${word}%E2%80%8B`);
	}
	for (const nearMiss of [
		"/mcpx",
		"/xmcp",
		"/mc",
		"/mcp/extra",
		"/mcp//extra",
		"/healthz",
		"/readyz",
		"/health/extra",
		"/ready/extra",
		"/",
		"",
		"/mcp/mcp",
		"/.mcp",
	]) {
		paths.add(nearMiss);
	}
	return [...paths];
}

function methodsFor(rawPath: string): Method[] {
	return /mcp/i.test(decodeSafe(rawPath)) ? ["GET", "POST"] : ["GET"];
}

function decodeSafe(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

let server: Server;
let port = 0;
const agent = new Agent({ keepAlive: true, maxSockets: 8 });
const observations: Observation[] = [];
let corpusSize = 0;
let sentCount = 0;
let notSent = 0;

function send(rawPath: string, method: Method): Promise<Observation | null> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (value: Observation | null) => {
			if (!settled) {
				settled = true;
				resolve(value);
			}
		};
		try {
			const req = httpRequest(
				{ host: "127.0.0.1", port, path: rawPath, method, agent },
				(res) => {
					const chunks: Buffer[] = [];
					res.on("data", (c: Buffer) => chunks.push(c));
					res.on("end", () => {
						try {
							const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
							finish({ rawPath, method, ...body });
						} catch {
							// Express answered without our handlers (e.g. a 400 from the
							// router); treat as not dispatched to any of our routes.
							finish(null);
						}
					});
				},
			);
			req.on("error", () => finish(null));
			req.end();
		} catch {
			// node:http refuses to send this path at all.
			finish(null);
		}
	});
}

before(async () => {
	// Same router defaults as http-app.ts: bare express(), no "strict routing"
	// or "case sensitive routing" settings.
	const app = express();
	app.use((req, res, next) => {
		res.locals.reqPath = req.path;
		res.locals.isMcp = isMcpRequestPath(req.path);
		res.locals.isProbe = isHealthOrReadyPath(req.path);
		next();
	});
	const reply = (route: string) => (_req: unknown, res: express.Response) => {
		res.json({
			route,
			reqPath: res.locals.reqPath,
			isMcp: res.locals.isMcp,
			isProbe: res.locals.isProbe,
		});
	};
	app.all("/mcp", reply("mcp"));
	app.get("/health", reply("health"));
	app.get("/ready", reply("ready"));
	app.use((_req, res) => {
		res.status(404);
		reply("none")(_req, res);
	});

	server = createServer(app);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	port = (server.address() as AddressInfo).port;

	const corpus = buildCorpus();
	corpusSize = corpus.length;
	for (const rawPath of corpus) {
		for (const method of methodsFor(rawPath)) {
			const observed = await send(rawPath, method);
			if (observed) {
				observations.push(observed);
				sentCount += 1;
			} else {
				notSent += 1;
			}
		}
	}
});

after(async () => {
	agent.destroy();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

function describeObservation(o: Observation): string {
	return `${o.method} raw=${JSON.stringify(o.rawPath)} route=${o.route} req.path=${JSON.stringify(o.reqPath)}`;
}

describe("request path classifiers vs Express routing", () => {
	it("sends a meaningful corpus", () => {
		assert.ok(corpusSize >= 300, `corpus too small: ${corpusSize}`);
		assert.ok(sentCount >= 300, `only ${sentCount} requests sent`);
		assert.ok(
			notSent < sentCount / 10,
			`${notSent} variants were not sent or answered`,
		);
		assert.ok(
			observations.some((o) => o.route === "mcp"),
			"no variant reached /mcp",
		);
		assert.ok(
			observations.some((o) => o.route === "health"),
			"no variant reached /health",
		);
		assert.ok(
			observations.some((o) => o.route === "ready"),
			"no variant reached /ready",
		);
	});

	it("P1: every path Express dispatches to /mcp is classified as an MCP path", () => {
		for (const o of observations) {
			if (o.route === "mcp") {
				assert.equal(
					o.isMcp,
					true,
					`unauthenticated /mcp reach: ${describeObservation(o)}`,
				);
			}
		}
	});

	it("P2: every path classified as health/ready is dispatched to /health or /ready only", () => {
		for (const o of observations) {
			if (o.isProbe) {
				assert.ok(
					o.route === "health" || o.route === "ready",
					`probe skip on non-probe route: ${describeObservation(o)}`,
				);
			}
		}
	});

	it("P1 inverse: every path classified as MCP is dispatched to /mcp", () => {
		for (const o of observations) {
			if (o.isMcp) {
				assert.equal(
					o.route,
					"mcp",
					`classified as MCP but not routed there: ${describeObservation(o)}`,
				);
			}
		}
	});
});
