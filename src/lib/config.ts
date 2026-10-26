import { Logger } from "./logger.js";

/**
 * Server configuration for MCP transports
 */

/**
 * Server configuration interface
 */
export interface ServerConfig {
	/** Transport type: 'stdio' for CLI or 'http' for HTTP server */
	transport: "stdio" | "http";
	/** Protocol for HTTP transport */
	protocol: "http" | "https";
	/** Port number for HTTP transport (default: 3000) */
	port: number;
	/** Host address for HTTP transport (default: 127.0.0.1) */
	host: string;
	/** Maximum number of concurrent HTTP MCP requests */
	maxSessions: number;
	/** Graceful shutdown timeout in milliseconds (default: 10000) */
	shutdownTimeout: number;
	/** Optional native TLS config for HTTPS mode */
	tls: {
		enabled: boolean;
		keyPath?: string;
		certPath?: string;
		caPath?: string;
	};
}

function parseStrictInteger(value: string): number {
	if (!/^\d+$/.test(value)) {
		return Number.NaN;
	}

	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}

/**
 * Get server configuration from environment variables with defaults
 * @returns ServerConfig with values from env vars or defaults
 */
export function getServerConfig(): ServerConfig {
	const transport = (process.env.MCP_TRANSPORT?.trim() || "stdio") as
		| "stdio"
		| "http";

	// Validate transport value
	if (transport !== "stdio" && transport !== "http") {
		throw new Error(
			`Invalid MCP_TRANSPORT value: ${transport}. Must be 'stdio' or 'http'`,
		);
	}
	const retiredSettings = [
		"MCP_SESSION_MODE",
		"MCP_SESSION_TIMEOUT",
		"MCP_EVENT_STORE",
		"MCP_EVENT_TTL_SECONDS",
		"MCP_EVENT_STORE_MAX_EVENTS",
		"MCP_EVENT_STORE_MAX_BYTES",
		"MCP_EVENT_STORE_COMMAND_TIMEOUT_MS",
		"MCP_EVENT_ENCRYPTION_KEY",
		"MCP_REDIS_KEY_PREFIX",
	].filter((name) => process.env[name] !== undefined);
	if (retiredSettings.length > 0) {
		Logger.warn(
			`Retired HTTP session/replay settings are ignored: ${retiredSettings.join(", ")}. See COMPATIBILITY.md for recovery and migration guidance.`,
		);
	}

	// PORT for HTTP transport, MCP_PORT for manual config
	const portVariable = process.env.PORT?.trim() ? "PORT" : "MCP_PORT";
	const portValue =
		process.env.PORT?.trim() || process.env.MCP_PORT?.trim() || "3000";
	const port = parseStrictInteger(portValue);
	if (Number.isNaN(port) || port < 1 || port > 65535) {
		throw new Error(
			`Invalid ${portVariable} value: ${portValue}. Must be a valid port number (1-65535)`,
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
		host = "127.0.0.1";
	}

	const shutdownTimeoutStr = (
		process.env.MCP_SHUTDOWN_TIMEOUT_MS || "10000"
	).trim();
	const shutdownTimeout = parseStrictInteger(shutdownTimeoutStr);
	if (Number.isNaN(shutdownTimeout) || shutdownTimeout <= 0) {
		throw new Error(
			`Invalid MCP_SHUTDOWN_TIMEOUT_MS value: ${shutdownTimeoutStr}. Must be a positive integer`,
		);
	}

	const maxSessionsStr = (process.env.MCP_MAX_SESSIONS || "100").trim();
	const maxSessions = parseStrictInteger(maxSessionsStr);
	if (!Number.isInteger(maxSessions) || maxSessions <= 0) {
		throw new Error(
			`Invalid MCP_MAX_SESSIONS value: ${maxSessionsStr}. Must be a positive integer`,
		);
	}

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
		protocol,
		port,
		host,
		maxSessions,
		shutdownTimeout,
		tls: {
			enabled: tlsEnabled,
			keyPath,
			certPath,
			caPath,
		},
	};
}
