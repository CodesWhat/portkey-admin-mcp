/**
 * Server configuration for MCP transports
 */

/**
 * Server configuration interface
 */
export interface ServerConfig {
	/** Transport type: 'stdio' for CLI or 'http' for HTTP server */
	transport: "stdio" | "http";
	/** Session behavior for HTTP transport */
	sessionMode: "stateful" | "stateless";
	/** Event store behavior for HTTP stream resumability */
	eventStore: {
		mode: "off" | "memory" | "redis";
		ttlSeconds: number;
		redisUrl?: string;
		redisKeyPrefix: string;
	};
	/** Protocol for HTTP transport */
	protocol: "http" | "https";
	/** Port number for HTTP transport (default: 3000) */
	port: number;
	/** Host address for HTTP transport (default: 0.0.0.0) */
	host: string;
	/** Session timeout in milliseconds (default: 3600000 = 1 hour) */
	sessionTimeout: number;
	/** Optional native TLS config for HTTPS mode */
	tls: {
		enabled: boolean;
		keyPath?: string;
		certPath?: string;
		caPath?: string;
	};
}

/**
 * Get server configuration from environment variables with defaults
 * @returns ServerConfig with values from env vars or defaults
 */
export function getServerConfig(): ServerConfig {
	const transport = (process.env.MCP_TRANSPORT?.trim() || "stdio") as
		| "stdio"
		| "http";
	const sessionMode = (process.env.MCP_SESSION_MODE?.trim().toLowerCase() ||
		"stateful") as "stateful" | "stateless";
	const eventStoreMode = (process.env.MCP_EVENT_STORE?.trim().toLowerCase() ||
		(sessionMode === "stateless" ? "memory" : "off")) as
		| "off"
		| "memory"
		| "redis";

	// Validate transport value
	if (transport !== "stdio" && transport !== "http") {
		throw new Error(
			`Invalid MCP_TRANSPORT value: ${transport}. Must be 'stdio' or 'http'`,
		);
	}
	if (sessionMode !== "stateful" && sessionMode !== "stateless") {
		throw new Error(
			`Invalid MCP_SESSION_MODE value: ${sessionMode}. Must be 'stateful' or 'stateless'`,
		);
	}
	if (!["off", "memory", "redis"].includes(eventStoreMode)) {
		throw new Error(
			`Invalid MCP_EVENT_STORE value: ${eventStoreMode}. Must be 'off', 'memory', or 'redis'`,
		);
	}

	// PORT for HTTP transport, MCP_PORT for manual config
	const port = Number.parseInt(
		process.env.PORT?.trim() || process.env.MCP_PORT?.trim() || "3000",
		10,
	);
	if (Number.isNaN(port) || port < 1 || port > 65535) {
		throw new Error(
			`Invalid MCP_PORT value: ${process.env.MCP_PORT}. Must be a valid port number (1-65535)`,
		);
	}

	let host: string;
	if (process.env.MCP_HOST !== undefined) {
		const trimmed = process.env.MCP_HOST.trim();
		if (!trimmed) {
			throw new Error("Invalid MCP_HOST value: must be a non-empty string");
		}
		host = trimmed;
	} else {
		host = "0.0.0.0";
	}

	const sessionTimeoutStr = (
		process.env.MCP_SESSION_TIMEOUT || "3600000"
	).trim();
	const sessionTimeout = Number.parseInt(sessionTimeoutStr, 10);
	if (Number.isNaN(sessionTimeout) || sessionTimeout < 0) {
		throw new Error(
			`Invalid MCP_SESSION_TIMEOUT value: ${sessionTimeoutStr}. Must be a non-negative number`,
		);
	}

	const eventStoreTtlStr = (process.env.MCP_EVENT_TTL_SECONDS || "3600").trim();
	const eventStoreTtlSeconds = Number.parseInt(eventStoreTtlStr, 10);
	if (Number.isNaN(eventStoreTtlSeconds) || eventStoreTtlSeconds <= 0) {
		throw new Error(
			`Invalid MCP_EVENT_TTL_SECONDS value: ${eventStoreTtlStr}. Must be a positive integer`,
		);
	}

	const redisUrl =
		process.env.MCP_REDIS_URL?.trim() || process.env.REDIS_URL?.trim();
	if (eventStoreMode === "redis" && !redisUrl) {
		throw new Error(
			"MCP_EVENT_STORE=redis requires MCP_REDIS_URL (or REDIS_URL) to be set",
		);
	}

	const redisKeyPrefix =
		process.env.MCP_REDIS_KEY_PREFIX?.trim() || "mcp:event-store";

	const keyPath = process.env.MCP_TLS_KEY_PATH?.trim() || undefined;
	const certPath = process.env.MCP_TLS_CERT_PATH?.trim() || undefined;
	const caPath = process.env.MCP_TLS_CA_PATH?.trim() || undefined;

	const hasKey = Boolean(keyPath);
	const hasCert = Boolean(certPath);
	if (hasKey !== hasCert) {
		throw new Error(
			"MCP_TLS_KEY_PATH and MCP_TLS_CERT_PATH must both be set to enable HTTPS",
		);
	}

	const tlsEnabled = hasKey && hasCert;
	const protocol: "http" | "https" = tlsEnabled ? "https" : "http";

	return {
		transport,
		sessionMode,
		eventStore: {
			mode: eventStoreMode,
			ttlSeconds: eventStoreTtlSeconds,
			redisUrl,
			redisKeyPrefix,
		},
		protocol,
		port,
		host,
		sessionTimeout,
		tls: {
			enabled: tlsEnabled,
			keyPath,
			certPath,
			caPath,
		},
	};
}
