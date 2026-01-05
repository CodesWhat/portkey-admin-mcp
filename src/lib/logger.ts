/**
 * Structured Logger for MCP Server
 * CRITICAL: Uses stderr to avoid interfering with stdio transport
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
	timestamp: string;
	level: LogLevel;
	message: string;
	requestId?: string;
	duration_ms?: number;
	method?: string;
	path?: string;
	statusCode?: number;
	error?: string;
	metadata?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

function getConfiguredLogLevel(): LogLevel {
	const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
	if (envLevel && envLevel in LOG_LEVELS) {
		return envLevel;
	}
	return "info"; // default
}

// Cache log level at module load to avoid repeated env var parsing
const configuredLogLevel = getConfiguredLogLevel();

function shouldLog(level: LogLevel): boolean {
	return LOG_LEVELS[level] >= LOG_LEVELS[configuredLogLevel];
}

function formatEntry(
	level: LogLevel,
	message: string,
	extra?: Partial<Omit<LogEntry, "timestamp" | "level" | "message">>,
): LogEntry {
	return {
		timestamp: new Date().toISOString(),
		level,
		message,
		...extra,
	};
}

function writeLog(entry: LogEntry): void {
	// CRITICAL: Write to stderr, NOT stdout (stdio transport uses stdout)
	process.stderr.write(`${JSON.stringify(entry)}\n`);
}

type LogExtras = Partial<Omit<LogEntry, "timestamp" | "level" | "message">>;

export const Logger = {
	debug(message: string, extra?: LogExtras): void {
		if (shouldLog("debug")) {
			writeLog(formatEntry("debug", message, extra));
		}
	},

	info(message: string, extra?: LogExtras): void {
		if (shouldLog("info")) {
			writeLog(formatEntry("info", message, extra));
		}
	},

	warn(message: string, extra?: LogExtras): void {
		if (shouldLog("warn")) {
			writeLog(formatEntry("warn", message, extra));
		}
	},

	error(message: string, extra?: LogExtras): void {
		if (shouldLog("error")) {
			writeLog(formatEntry("error", message, extra));
		}
	},
};
