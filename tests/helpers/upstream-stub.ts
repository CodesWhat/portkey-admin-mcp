import { createServer, type Server } from "node:http";

export interface UpstreamStub {
	/** Environment that points the server at this stub over loopback HTTP. */
	env: Record<string, string>;
	/** Method and URL of every request the stub has received. */
	hits: Array<{ method: string; url: string }>;
	close(): Promise<void>;
}

/**
 * A loopback stand-in for the Portkey API. Tests that need to prove a tool
 * call did or did not go upstream point PORTKEY_BASE_URL at it, so they pass
 * without outbound networking and count hits instead of trusting a live 401.
 */
export async function startUpstreamStub(
	status = 401,
	body: unknown = { error: { message: "stub upstream rejected the request" } },
): Promise<UpstreamStub> {
	const hits: UpstreamStub["hits"] = [];
	const server: Server = createServer((req, res) => {
		hits.push({ method: req.method ?? "GET", url: req.url ?? "" });
		res.writeHead(status, { "content-type": "application/json" });
		res.end(JSON.stringify(body));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("upstream stub failed to bind");
	}

	return {
		env: {
			PORTKEY_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
			PORTKEY_ALLOW_PRIVATE_BASE_URL: "true",
			PORTKEY_ALLOW_INSECURE_HTTP: "true",
		},
		hits,
		close: () =>
			new Promise<void>((resolve) => {
				server.closeAllConnections();
				server.close(() => resolve());
			}),
	};
}
