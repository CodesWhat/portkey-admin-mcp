import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AuditService } from "../src/services/audit.service.js";
import {
	BaseService,
	isNoContent,
	isPrivateOrLocalHost,
	MISSING_API_KEY_PLACEHOLDER,
	type NoContent,
	validateUrl,
} from "../src/services/base.service.js";
import {
	AnalyticsService,
	CollectionsService,
	ConfigsService,
	GuardrailsService,
	getSharedPortkeyService,
	HealthService,
	IntegrationsService,
	KeysService,
	LabelsService,
	LimitsService,
	LoggingService,
	McpIntegrationsService,
	McpServersService,
	PartialsService,
	PortkeyService,
	PromptsService,
	ProvidersService,
	SecretReferencesService,
	TracingService,
	UsersService,
	WorkspacesService,
} from "../src/services/index.js";

const BASE_URL = "https://api.example.com/v1";

interface QueuedFetch {
	body?: unknown;
	error?: unknown;
	status: number;
}

interface CapturedFetch {
	input: RequestInfo | URL;
	init?: RequestInit;
}

class TestBaseService extends BaseService {
	get exposedApiKey(): string {
		return this.apiKey;
	}

	get exposedBaseUrl(): string {
		return this.baseUrl;
	}

	get exposedTimeout(): number {
		return this.timeout;
	}

	encode(value: string): string {
		return this.encodePathSegment(value);
	}

	read(path: string, params?: object): Promise<unknown> {
		return this.get(path, params);
	}

	readPublic(path: string, params?: object): Promise<unknown> {
		return this.getPublic(path, params);
	}

	create(path: string, body?: unknown): Promise<unknown> {
		return this.post(path, body);
	}

	replace(path: string, body?: unknown): Promise<unknown> {
		return this.put(path, body);
	}

	remove(path: string, params?: object): Promise<unknown | NoContent> {
		return this.delete(path, params);
	}
}

let originalFetch: typeof globalThis.fetch;
let originalApiKey: string | undefined;
let originalBaseUrl: string | undefined;
let originalAllowPrivate: string | undefined;
let originalAllowInsecure: string | undefined;
let capturedFetches: CapturedFetch[] = [];
let queuedFetches: QueuedFetch[] = [];

function enqueue(body: unknown = {}, status = 200): void {
	queuedFetches.push({ body, status });
}

function enqueueError(error: unknown): void {
	queuedFetches.push({ error, status: 0 });
}

function capturedUrl(index: number): URL {
	return new URL(String(capturedFetches[index]?.input));
}

function capturedHeaders(index: number): Record<string, string> {
	return capturedFetches[index]?.init?.headers as Record<string, string>;
}

function capturedBody(index: number): unknown {
	const body = capturedFetches[index]?.init?.body;
	return body === undefined ? undefined : JSON.parse(String(body));
}

function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
	} else {
		process.env[name] = value;
	}
}

beforeEach(() => {
	originalFetch = globalThis.fetch;
	originalApiKey = process.env.PORTKEY_API_KEY;
	originalBaseUrl = process.env.PORTKEY_BASE_URL;
	originalAllowPrivate = process.env.PORTKEY_ALLOW_PRIVATE_BASE_URL;
	originalAllowInsecure = process.env.PORTKEY_ALLOW_INSECURE_HTTP;
	capturedFetches = [];
	queuedFetches = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		capturedFetches.push({ input, init });
		const queued = queuedFetches.shift() ?? { body: {}, status: 200 };
		if (queued.error !== undefined) {
			throw queued.error;
		}
		if (queued.status === 204) {
			return new Response(null, { status: 204 });
		}
		return Response.json(queued.body, { status: queued.status });
	}) as typeof globalThis.fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	restoreEnv("PORTKEY_API_KEY", originalApiKey);
	restoreEnv("PORTKEY_BASE_URL", originalBaseUrl);
	restoreEnv("PORTKEY_ALLOW_PRIVATE_BASE_URL", originalAllowPrivate);
	restoreEnv("PORTKEY_ALLOW_INSECURE_HTTP", originalAllowInsecure);
});

describe("BaseService construction", () => {
	it("requires an API key when neither an override nor environment value exists", () => {
		delete process.env.PORTKEY_API_KEY;
		delete process.env.PORTKEY_BASE_URL;
		assert.throws(
			() => new TestBaseService(),
			/PORTKEY_API_KEY environment variable is not set/,
		);
	});

	it("uses environment configuration and strips trailing URL slashes", () => {
		process.env.PORTKEY_API_KEY = "environment-key";
		process.env.PORTKEY_BASE_URL = "https://gateway.example.com/v2///";
		const service = new TestBaseService();

		assert.equal(service.exposedApiKey, "environment-key");
		assert.equal(service.exposedBaseUrl, "https://gateway.example.com/v2");
		assert.equal(service.exposedTimeout, 30000);
		assert.equal(
			service.encode("team/name with spaces"),
			"team%2Fname%20with%20spaces",
		);
	});

	it("accepts explicit private HTTP gateways only with both opt-ins", () => {
		delete process.env.PORTKEY_ALLOW_PRIVATE_BASE_URL;
		delete process.env.PORTKEY_ALLOW_INSECURE_HTTP;
		assert.throws(
			() => validateUrl("http://[::1]:8787/v1"),
			/loopback or private-network/,
		);

		process.env.PORTKEY_ALLOW_PRIVATE_BASE_URL = " 1 ";
		assert.throws(
			() => validateUrl("http://[::1]:8787/v1"),
			/Refusing insecure HTTP/,
		);

		process.env.PORTKEY_ALLOW_INSECURE_HTTP = " TRUE ";
		assert.doesNotThrow(() => validateUrl("http://[::1]:8787/v1"));
	});

	it("classifies the remaining private-network ranges", () => {
		assert.equal(isPrivateOrLocalHost("fe80::1"), true);
		assert.equal(isPrivateOrLocalHost("api.example.com"), false);
		assert.equal(isPrivateOrLocalHost("169.254.169.254"), true);
		assert.equal(isPrivateOrLocalHost("172.20.0.1"), true);
	});

	it("preserves unexpected URL parser errors", () => {
		const originalUrl = globalThis.URL;
		const parserFailure = new RangeError("URL parser failed");
		globalThis.URL = function BrokenUrl(): never {
			throw parserFailure;
		} as unknown as typeof URL;
		try {
			assert.throws(
				() => validateUrl(BASE_URL),
				(error) => error === parserFailure,
			);
		} finally {
			globalThis.URL = originalUrl;
		}
	});
});

describe("BaseService HTTP lifecycle", () => {
	it("builds authenticated requests and preserves falsy query values", async () => {
		const service = new TestBaseService("test-key", `${BASE_URL}///`);
		await service.read("/resources", {
			page: 0,
			enabled: false,
			search: "",
			omitted: undefined,
		});

		assert.equal(capturedUrl(0).pathname, "/v1/resources");
		assert.equal(capturedUrl(0).searchParams.get("page"), "0");
		assert.equal(capturedUrl(0).searchParams.get("enabled"), "false");
		assert.equal(capturedUrl(0).searchParams.get("search"), "");
		assert.equal(capturedUrl(0).searchParams.has("omitted"), false);
		assert.deepEqual(capturedHeaders(0), {
			Accept: "application/json",
			"x-portkey-api-key": "test-key",
		});
		assert.equal(capturedFetches[0]?.init?.redirect, "manual");
	});

	it("sets JSON headers for writes and serializes only present bodies", async () => {
		const service = new TestBaseService("test-key", BASE_URL);
		await service.create("/resources", { name: "Primary" });
		await service.replace("/resources/one", { enabled: false });
		await service.create("/resources/empty", undefined);

		assert.deepEqual(capturedHeaders(0), {
			Accept: "application/json",
			"x-portkey-api-key": "test-key",
			"Content-Type": "application/json",
		});
		assert.deepEqual(capturedBody(0), { name: "Primary" });
		assert.deepEqual(capturedBody(1), { enabled: false });
		assert.equal(capturedBody(2), undefined);
	});

	it("uses the public catalog origin without exposing the API key", async () => {
		const service = new TestBaseService("private-key", BASE_URL);
		await service.readPublic("/model-configs/pricing/openai/gpt-5", {
			currency: "USD",
		});

		assert.equal(capturedUrl(0).origin, "https://api.portkey.ai");
		assert.equal(
			capturedUrl(0).pathname,
			"/model-configs/pricing/openai/gpt-5",
		);
		assert.equal(capturedUrl(0).searchParams.get("currency"), "USD");
		assert.deepEqual(capturedHeaders(0), { Accept: "application/json" });
	});

	it("returns the no-content sentinel only for successful deletes", async () => {
		const service = new TestBaseService("test-key", BASE_URL);
		enqueue(undefined, 204);
		assert.equal(isNoContent(await service.remove("/resources/one")), true);

		enqueue({ deleted: true });
		assert.deepEqual(await service.remove("/resources/two", { force: true }), {
			deleted: true,
		});
		assert.equal(capturedUrl(1).searchParams.get("force"), "true");
	});

	it("preserves non-Error network failures for callers", async () => {
		const service = new TestBaseService("test-key", BASE_URL);
		enqueueError("socket closed");
		let rejection: unknown;
		try {
			await service.read("/resources");
		} catch (error) {
			rejection = error;
		}
		assert.equal(rejection, "socket closed");
	});

	it("rejects the missing-credential placeholder before making a network call", async () => {
		const service = new TestBaseService(MISSING_API_KEY_PLACEHOLDER, BASE_URL);

		await assert.rejects(
			service.read("/resources"),
			/PORTKEY_API_KEY is not configured\. Set the PORTKEY_API_KEY environment variable to a valid Portkey Admin API key\./,
		);
		assert.equal(capturedFetches.length, 0);
	});

	it("still allows unauthenticated public-catalog reads with the placeholder credential", async () => {
		const service = new TestBaseService(MISSING_API_KEY_PLACEHOLDER, BASE_URL);
		await service.readPublic("/model-configs/pricing/openai/gpt-5");

		assert.equal(capturedFetches.length, 1);
		assert.deepEqual(capturedHeaders(0), { Accept: "application/json" });
	});

	it("surfaces structured HTTP failures with status and upstream details", async () => {
		const service = new TestBaseService("test-key", BASE_URL);
		enqueue(
			{
				error: {
					message: "Rate limit exceeded",
					code: "rate_limit_exceeded",
				},
			},
			429,
		);

		await assert.rejects(service.read("/resources"), (error: unknown) => {
			const fetchError = error as {
				message: string;
				status: number;
				response: { code?: string };
			};
			assert.equal(fetchError.message, "Rate limit exceeded");
			assert.equal(fetchError.status, 429);
			assert.equal(fetchError.response.code, "rate_limit_exceeded");
			return true;
		});
	});
});

describe("AuditService", () => {
	it("forwards the full audit filter and pagination contract", async () => {
		const service = new AuditService("test-key", BASE_URL);
		await service.listAuditLogs({
			workspace_id: "workspace-1",
			actor_id: "user-1",
			action: "workspace.updated",
			resource_type: "workspace",
			resource_id: "workspace-1",
			start_time: "2026-08-01T00:00:00Z",
			end_time: "2026-08-02T00:00:00Z",
			current_page: 2,
			page_size: 50,
		});

		assert.equal(capturedUrl(0).pathname, "/v1/audit-logs");
		assert.deepEqual(Object.fromEntries(capturedUrl(0).searchParams), {
			workspace_id: "workspace-1",
			actor_id: "user-1",
			action: "workspace.updated",
			resource_type: "workspace",
			resource_id: "workspace-1",
			start_time: "2026-08-01T00:00:00Z",
			end_time: "2026-08-02T00:00:00Z",
			current_page: "2",
			page_size: "50",
		});
	});

	it("supports an unfiltered audit log request", async () => {
		const service = new AuditService("test-key", BASE_URL);
		await service.listAuditLogs();
		assert.equal(capturedUrl(0).search, "");
	});
});

describe("PortkeyService lifecycle", () => {
	it("requires a key for direct construction", () => {
		delete process.env.PORTKEY_API_KEY;
		delete process.env.PORTKEY_BASE_URL;
		assert.throws(() => new PortkeyService(), /Portkey API key is required/);
	});

	it("constructs every domain client from an environment key", () => {
		process.env.PORTKEY_API_KEY = "container-environment-key";
		process.env.PORTKEY_BASE_URL = "https://gateway.example.com/v1";
		const service = new PortkeyService();

		assert.equal(service.users instanceof UsersService, true);
		assert.equal(service.workspaces instanceof WorkspacesService, true);
		assert.equal(service.configs instanceof ConfigsService, true);
		assert.equal(service.keys instanceof KeysService, true);
		assert.equal(service.collections instanceof CollectionsService, true);
		assert.equal(service.prompts instanceof PromptsService, true);
		assert.equal(service.analytics instanceof AnalyticsService, true);
		assert.equal(service.guardrails instanceof GuardrailsService, true);
		assert.equal(service.integrations instanceof IntegrationsService, true);
		assert.equal(service.limits instanceof LimitsService, true);
		assert.equal(service.audit instanceof AuditService, true);
		assert.equal(service.labels instanceof LabelsService, true);
		assert.equal(service.partials instanceof PartialsService, true);
		assert.equal(service.tracing instanceof TracingService, true);
		assert.equal(service.logging instanceof LoggingService, true);
		assert.equal(service.providers instanceof ProvidersService, true);
		assert.equal(
			service.secretReferences instanceof SecretReferencesService,
			true,
		);
		assert.equal(
			service.mcpIntegrations instanceof McpIntegrationsService,
			true,
		);
		assert.equal(service.mcpServers instanceof McpServersService, true);
		assert.equal(service.health instanceof HealthService, true);
	});

	it("rejects an unsafe environment base URL before constructing clients", () => {
		process.env.PORTKEY_API_KEY = "container-key";
		process.env.PORTKEY_BASE_URL = "http://169.254.169.254/latest/meta-data";
		assert.throws(() => new PortkeyService(), /loopback or private-network/);
	});

	it("reuses shared clients by key and base URL without storing raw keys in cache IDs", () => {
		process.env.PORTKEY_BASE_URL = "https://one.example.com/v1";
		const first = getSharedPortkeyService("shared-key-one");
		const repeated = getSharedPortkeyService("shared-key-one");
		const otherKey = getSharedPortkeyService("shared-key-two");

		assert.equal(repeated, first);
		assert.notEqual(otherKey, first);

		process.env.PORTKEY_BASE_URL = "https://two.example.com/v1";
		const otherBaseUrl = getSharedPortkeyService("shared-key-one");
		assert.notEqual(otherBaseUrl, first);
	});

	it("allows shared startup without credentials while preserving cache reuse", () => {
		delete process.env.PORTKEY_API_KEY;
		delete process.env.PORTKEY_BASE_URL;
		const first = getSharedPortkeyService();
		const repeated = getSharedPortkeyService();

		assert.equal(repeated, first);
		assert.equal(first.health instanceof HealthService, true);
	});

	it("gives the first tool call an actionable error instead of sending the placeholder upstream", async () => {
		delete process.env.PORTKEY_API_KEY;
		delete process.env.PORTKEY_BASE_URL;
		const service = getSharedPortkeyService();

		await assert.rejects(
			service.workspaces.listWorkspaces(),
			/PORTKEY_API_KEY is not configured\. Set the PORTKEY_API_KEY environment variable to a valid Portkey Admin API key\./,
		);
		assert.equal(capturedFetches.length, 0);
	});
});
