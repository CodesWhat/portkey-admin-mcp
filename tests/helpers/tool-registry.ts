export type CapturedToolCallback = (...args: unknown[]) => Promise<unknown>;

export type ToolRegistrationTestServer = {
	tool(name: string, ...rest: unknown[]): never;
	registerTool(
		name: string,
		config: Record<string, unknown>,
		callback: CapturedToolCallback,
	): never;
};

/** Capture callbacks registered through either the legacy or current MCP API. */
export function registerToolCallbacks(
	register: (server: ToolRegistrationTestServer) => void,
): Map<string, CapturedToolCallback> {
	const callbacks = new Map<string, CapturedToolCallback>();
	const capture = (name: string, callback: unknown) => {
		callbacks.set(name, callback as CapturedToolCallback);
		return {} as never;
	};

	register({
		tool(name: string, ...rest: unknown[]) {
			return capture(name, rest.at(-1));
		},
		registerTool(
			name: string,
			_config: Record<string, unknown>,
			callback: CapturedToolCallback,
		) {
			return capture(name, callback);
		},
	});

	return callbacks;
}
