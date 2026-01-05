/**
 * Server configuration for MCP transports
 */

/**
 * Server configuration interface
 */
export interface ServerConfig {
	/** Transport type: 'stdio' for CLI or 'http' for HTTP server */
	transport: "stdio" | "http";
	/** Port number for HTTP transport (default: 3000) */
	port: number;
	/** Host address for HTTP transport (default: localhost) */
	host: string;
	/** Session timeout in milliseconds (default: 3600000 = 1 hour) */
	sessionTimeout: number;
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
		host = "localhost";
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

	return {
		transport,
		port,
		host,
		sessionTimeout,
	};
}
