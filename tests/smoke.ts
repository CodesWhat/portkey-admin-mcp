/**
 * Smoke Test Suite
 *
 * Hits every read-only endpoint once to verify no crashes.
 * Run: npx tsx tests/smoke.ts
 */

import "dotenv/config";
import { HealthService, PortkeyService } from "../src/services/index.js";

let portkey: PortkeyService;
let health: HealthService;

// Test context - stores discovered IDs for subsequent tests
interface TestContext {
	workspaceId?: string;
	userId?: string;
	userInviteId?: string;
	collectionId?: string;
	promptId?: string;
	virtualKeySlug?: string;
	configSlug?: string;
	guardrailId?: string;
	integrationSlug?: string;
	usageLimitId?: string;
	rateLimitId?: string;
	labelId?: string;
	partialId?: string;
	traceId?: string;
	logExportId?: string;
	providerSlug?: string;
	apiKeyId?: string;
}

interface TestResult {
	name: string;
	status: "PASS" | "FAIL" | "SKIP";
	message?: string;
	latency?: number;
}

const results: TestResult[] = [];
const ctx: TestContext = {};

// Analytics time range (last 24 hours)
const now = new Date();
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const analyticsParams = {
	time_of_generation_min: yesterday.toISOString(),
	time_of_generation_max: now.toISOString(),
};

// Helper to run a test
async function test(
	name: string,
	fn: () => Promise<unknown>,
	skipIf?: () => string | null,
): Promise<void> {
	const skipReason = skipIf?.();
	if (skipReason) {
		results.push({ name, status: "SKIP", message: skipReason });
		console.log(`  \x1b[33mSKIP\x1b[0m  ${name} (${skipReason})`);
		return;
	}

	const start = Date.now();
	try {
		await fn();
		const latency = Date.now() - start;
		results.push({ name, status: "PASS", latency });
		console.log(`  \x1b[32mPASS\x1b[0m  ${name} (${latency}ms)`);
	} catch (error) {
		const latency = Date.now() - start;
		const message = error instanceof Error ? error.message : String(error);
		results.push({ name, status: "FAIL", message, latency });
		console.log(`  \x1b[31mFAIL\x1b[0m  ${name}: ${message}`);
	}
}

async function main() {
	console.log("\nPortkey Admin API Smoke Test");
	console.log("=".repeat(50));
	console.log(`Base URL: ${process.env.PORTKEY_BASE_URL ?? "default"}`);
	console.log(`Time: ${new Date().toISOString()}\n`);

	if (!process.env.PORTKEY_API_KEY) {
		console.error("ERROR: PORTKEY_API_KEY not set");
		process.exit(1);
	}

	// Initialize services after API key validation
	portkey = new PortkeyService();
	health = new HealthService();

	// ============================================================
	// Phase 1: Discovery (list endpoints)
	// ============================================================
	console.log("Discovery Phase");
	console.log("-".repeat(50));

	await test("listWorkspaces", async () => {
		const res = await portkey.listWorkspaces();
		if (res.data?.[0]) ctx.workspaceId = res.data[0].id;
	});

	await test("listUsers", async () => {
		const res = await portkey.listUsers();
		if (res.data?.[0]) ctx.userId = res.data[0].id;
	});

	await test("listUserInvites", async () => {
		const res = await portkey.listUserInvites();
		if (res.data?.[0]) ctx.userInviteId = res.data[0].id;
	});

	await test("listConfigs", async () => {
		const res = await portkey.listConfigs();
		if (res.data?.[0]) ctx.configSlug = res.data[0].slug;
	});

	await test("listVirtualKeys", async () => {
		const res = await portkey.listVirtualKeys();
		if (res.data?.[0]) ctx.virtualKeySlug = res.data[0].slug;
	});

	await test("listApiKeys", async () => {
		const res = await portkey.listApiKeys();
		if (res.data?.[0]) ctx.apiKeyId = res.data[0].id;
	});

	await test(
		"listCollections",
		async () => {
			const res = await portkey.listCollections({
				workspace_id: ctx.workspaceId!,
			});
			if (res.data?.[0]) ctx.collectionId = res.data[0].id;
		},
		() => (ctx.workspaceId ? null : "no workspaceId"),
	);

	await test(
		"listPrompts",
		async () => {
			const res = await portkey.listPrompts({ workspace_id: ctx.workspaceId! });
			if (res.data?.[0]) ctx.promptId = res.data[0].id;
		},
		() => (ctx.workspaceId ? null : "no workspaceId"),
	);

	await test(
		"listGuardrails",
		async () => {
			const res = await portkey.listGuardrails({
				workspace_id: ctx.workspaceId!,
			});
			if (res.data?.[0]) ctx.guardrailId = res.data[0].id;
		},
		() => (ctx.workspaceId ? null : "no workspaceId"),
	);

	await test(
		"listUsageLimits",
		async () => {
			const res = await portkey.listUsageLimits(ctx.workspaceId);
			if (res.data?.[0]) ctx.usageLimitId = res.data[0].id;
		},
		() => (ctx.workspaceId ? null : "no workspaceId"),
	);

	await test(
		"listRateLimits",
		async () => {
			const res = await portkey.listRateLimits(ctx.workspaceId);
			if (res.data?.[0]) ctx.rateLimitId = res.data[0].id;
		},
		() => (ctx.workspaceId ? null : "no workspaceId"),
	);

	await test("listLabels", async () => {
		const res = await portkey.listLabels();
		if (res.data?.[0]) ctx.labelId = res.data[0].id;
	});

	await test("listPromptPartials", async () => {
		const res = await portkey.listPromptPartials();
		if (res?.[0]) ctx.partialId = res[0].id;
	});

	await test(
		"listLogExports",
		async () => {
			const res = await portkey.listLogExports({
				workspace_id: ctx.workspaceId!,
			});
			if (res.data?.[0]) ctx.logExportId = res.data[0].id;
		},
		() => (ctx.workspaceId ? null : "no workspaceId"),
	);

	await test("listTraces", async () => {
		const res = await portkey.listTraces({ page_size: 1 });
		if (res.data?.[0]) ctx.traceId = res.data[0].id;
	});

	await test("listProviders", async () => {
		const res = await portkey.listProviders();
		if (res.data?.[0]) ctx.providerSlug = res.data[0].slug;
	});

	await test("listIntegrations", async () => {
		const res = await portkey.listIntegrations();
		if (res.data?.[0]) ctx.integrationSlug = res.data[0].slug;
	});

	await test("listAuditLogs", async () => {
		await portkey.listAuditLogs();
	});

	// ============================================================
	// Phase 2: Read Operations (get endpoints)
	// ============================================================
	console.log("\nRead Operations");
	console.log("-".repeat(50));

	await test(
		"getWorkspace",
		async () => {
			await portkey.getWorkspace(ctx.workspaceId!);
		},
		() => (ctx.workspaceId ? null : "no workspaceId"),
	);

	await test(
		"listWorkspaceMembers",
		async () => {
			await portkey.listWorkspaceMembers(ctx.workspaceId!);
		},
		() => (ctx.workspaceId ? null : "no workspaceId"),
	);

	await test(
		"getUser",
		async () => {
			await portkey.getUser(ctx.userId!);
		},
		() => (ctx.userId ? null : "no userId"),
	);

	await test("getUserGroupedData", async () => {
		await portkey.getUserGroupedData(analyticsParams);
	});

	await test(
		"getUserInvite",
		async () => {
			await portkey.getUserInvite(ctx.userInviteId!);
		},
		() => (ctx.userInviteId ? null : "no userInviteId"),
	);

	await test(
		"getConfig",
		async () => {
			await portkey.getConfig(ctx.configSlug!);
		},
		() => (ctx.configSlug ? null : "no configSlug"),
	);

	await test(
		"listConfigVersions",
		async () => {
			await portkey.listConfigVersions(ctx.configSlug!);
		},
		() => (ctx.configSlug ? null : "no configSlug"),
	);

	await test(
		"getVirtualKey",
		async () => {
			await portkey.getVirtualKey(ctx.virtualKeySlug!);
		},
		() => (ctx.virtualKeySlug ? null : "no virtualKeySlug"),
	);

	await test(
		"getApiKey",
		async () => {
			await portkey.getApiKey(ctx.apiKeyId!);
		},
		() => (ctx.apiKeyId ? null : "no apiKeyId"),
	);

	await test(
		"getCollection",
		async () => {
			await portkey.getCollection(ctx.collectionId!);
		},
		() => (ctx.collectionId ? null : "no collectionId"),
	);

	await test(
		"getPrompt",
		async () => {
			await portkey.getPrompt(ctx.promptId!);
		},
		() => (ctx.promptId ? null : "no promptId"),
	);

	await test(
		"listPromptVersions",
		async () => {
			await portkey.listPromptVersions(ctx.promptId!);
		},
		() => (ctx.promptId ? null : "no promptId"),
	);

	await test(
		"getGuardrail",
		async () => {
			await portkey.getGuardrail(ctx.guardrailId!);
		},
		() => (ctx.guardrailId ? null : "no guardrailId"),
	);

	await test(
		"getUsageLimit",
		async () => {
			await portkey.getUsageLimit(ctx.usageLimitId!);
		},
		() => (ctx.usageLimitId ? null : "no usageLimitId"),
	);

	await test(
		"getRateLimit",
		async () => {
			await portkey.getRateLimit(ctx.rateLimitId!);
		},
		() => (ctx.rateLimitId ? null : "no rateLimitId"),
	);

	await test(
		"getLabel",
		async () => {
			await portkey.getLabel(ctx.labelId!);
		},
		() => (ctx.labelId ? null : "no labelId"),
	);

	await test(
		"getPromptPartial",
		async () => {
			await portkey.getPromptPartial(ctx.partialId!);
		},
		() => (ctx.partialId ? null : "no partialId"),
	);

	await test(
		"listPartialVersions",
		async () => {
			await portkey.listPartialVersions(ctx.partialId!);
		},
		() => (ctx.partialId ? null : "no partialId"),
	);

	await test(
		"getTrace",
		async () => {
			await portkey.getTrace(ctx.traceId!);
		},
		() => (ctx.traceId ? null : "no traceId"),
	);

	await test(
		"getLogExport",
		async () => {
			await portkey.getLogExport(ctx.logExportId!);
		},
		() => (ctx.logExportId ? null : "no logExportId"),
	);

	await test(
		"getProvider",
		async () => {
			await portkey.getProvider(ctx.providerSlug!);
		},
		() => (ctx.providerSlug ? null : "no providerSlug"),
	);

	await test(
		"getIntegration",
		async () => {
			await portkey.getIntegration(ctx.integrationSlug!);
		},
		() => (ctx.integrationSlug ? null : "no integrationSlug"),
	);

	await test(
		"listIntegrationModels",
		async () => {
			await portkey.listIntegrationModels(ctx.integrationSlug!);
		},
		() => (ctx.integrationSlug ? null : "no integrationSlug"),
	);

	await test(
		"listIntegrationWorkspaces",
		async () => {
			await portkey.listIntegrationWorkspaces(ctx.integrationSlug!);
		},
		() => (ctx.integrationSlug ? null : "no integrationSlug"),
	);

	// ============================================================
	// Phase 3: Analytics (time-bounded)
	// ============================================================
	console.log("\nAnalytics (last 24h)");
	console.log("-".repeat(50));

	await test("getCostAnalytics", async () => {
		await portkey.getCostAnalytics(analyticsParams);
	});

	await test("getRequestAnalytics", async () => {
		await portkey.getRequestAnalytics(analyticsParams);
	});

	await test("getTokenAnalytics", async () => {
		await portkey.getTokenAnalytics(analyticsParams);
	});

	await test("getLatencyAnalytics", async () => {
		await portkey.getLatencyAnalytics(analyticsParams);
	});

	await test("getErrorAnalytics", async () => {
		await portkey.getErrorAnalytics(analyticsParams);
	});

	await test("getErrorRateAnalytics", async () => {
		await portkey.getErrorRateAnalytics(analyticsParams);
	});

	await test("getCacheHitLatency", async () => {
		await portkey.getCacheHitLatency(analyticsParams);
	});

	await test("getCacheHitRate", async () => {
		await portkey.getCacheHitRate(analyticsParams);
	});

	await test("getUsersAnalytics", async () => {
		await portkey.getUsersAnalytics(analyticsParams);
	});

	// ============================================================
	// Phase 4: Health
	// ============================================================
	console.log("\nHealth");
	console.log("-".repeat(50));

	await test("ping", async () => {
		const res = await health.ping();
		console.log(`         Latency: ${res.latency_ms}ms`);
	});

	// ============================================================
	// Summary
	// ============================================================
	console.log("\n" + "=".repeat(50));
	console.log("SUMMARY");
	console.log("=".repeat(50));

	const passed = results.filter((r) => r.status === "PASS").length;
	const failed = results.filter((r) => r.status === "FAIL").length;
	const skipped = results.filter((r) => r.status === "SKIP").length;

	console.log(`\nTotal: ${results.length} endpoints`);
	console.log(`  \x1b[32mPassed:  ${passed}\x1b[0m`);
	console.log(`  \x1b[31mFailed:  ${failed}\x1b[0m`);
	console.log(`  \x1b[33mSkipped: ${skipped}\x1b[0m`);

	if (failed > 0) {
		console.log("\nFailed Tests:");
		for (const r of results.filter((r) => r.status === "FAIL")) {
			console.log(`  - ${r.name}: ${r.message}`);
		}
	}

	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
