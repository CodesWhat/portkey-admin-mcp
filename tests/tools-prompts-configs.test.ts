import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerConfigsTools } from "../src/tools/configs.tools.js";
import { registerPromptsTools } from "../src/tools/prompts.tools.js";
import {
	parseToolResult,
	registerToolCallbacks,
} from "./helpers/tool-registry.js";

function promptCallbacks(
	prompts: Record<string, unknown>,
): ReturnType<typeof registerToolCallbacks> {
	return registerToolCallbacks((server) => {
		registerPromptsTools(server as never, { prompts } as never);
	});
}

function configCallbacks(
	configs: Record<string, unknown>,
): ReturnType<typeof registerToolCallbacks> {
	return registerToolCallbacks((server) => {
		registerConfigsTools(server as never, { configs } as never);
	});
}

describe("prompt update dry runs", () => {
	it("reports a structured messages alias as a template change", async () => {
		let updateCalled = false;
		const callbacks = registerToolCallbacks((server) => {
			registerPromptsTools(
				server as never,
				{
					prompts: {
						getPrompt: async () => ({
							id: "prompt-1",
							name: "Support Prompt",
							slug: "support-prompt",
							collection_id: "collection-1",
							created_at: "2026-01-01T00:00:00.000Z",
							last_updated_at: "2026-01-02T00:00:00.000Z",
							current_version: {
								id: "version-1",
								version_number: 1,
								string: "Old template",
								parameters: {},
								created_at: "2026-01-01T00:00:00.000Z",
							},
							versions: [],
							object: "prompt" as const,
						}),
						updatePrompt: async () => {
							updateCalled = true;
							return {
								id: "prompt-1",
								slug: "support-prompt",
								prompt_version_id: "version-2",
								object: "prompt" as const,
							};
						},
					},
				} as never,
			);
		});

		const callback = callbacks.get("update_prompt");
		assert.ok(callback, "expected update_prompt to be registered");

		const payload = parseToolResult(
			await callback({
				prompt_id: "prompt-1",
				dry_run: true,
				messages: [
					{
						role: "system",
						content: [{ type: "text", text: "New template" }],
					},
				],
			}),
		);

		assert.deepEqual(payload.changes, ["string"]);
		assert.equal(updateCalled, false);
	});
});

describe("prompt creation tools", () => {
	it("returns a preview without creating a prompt during a dry run", async () => {
		let createCalled = false;
		const callback = promptCallbacks({
			createPrompt: async () => {
				createCalled = true;
			},
		}).get("create_prompt");
		assert.ok(callback, "expected create_prompt to be registered");

		const payload = parseToolResult(
			await callback({
				name: "Support Prompt",
				collection_id: "collection-1",
				string: "Hello {{name}}",
				parameters: { name: "Ada" },
				virtual_key: "vk-support",
				model: "gpt-4.1",
				dry_run: true,
			}),
		);

		assert.equal(payload.dry_run, true);
		assert.equal(payload.action, "create");
		assert.deepEqual(payload.prompt_preview, {
			name: "Support Prompt",
			collection_id: "collection-1",
			model: "gpt-4.1",
			template_length: 14,
			parameter_count: 1,
		});
		assert.equal(createCalled, false);
	});

	it("forwards optional model, metadata, function, and tool settings", async () => {
		let received: Record<string, unknown> | undefined;
		const callback = promptCallbacks({
			createPrompt: async (payload: Record<string, unknown>) => {
				received = payload;
				return {
					id: "prompt-1",
					slug: "support-prompt",
					version_id: "version-1",
					object: "prompt",
				};
			},
		}).get("create_prompt");
		assert.ok(callback, "expected create_prompt to be registered");

		const toolDefinition = {
			type: "function",
			function: {
				name: "search_docs",
				description: "Search support documentation",
				parameters: { type: "object" },
			},
		};
		const payload = parseToolResult(
			await callback({
				name: "Support Prompt",
				collection_id: "collection-1",
				string: "Help the customer",
				parameters: {},
				virtual_key: "vk-support",
				ai_model_id: "model-1",
				finetune_id: "finetune-1",
				version_description: "Initial version",
				template_metadata: { app: "support", env: "prod" },
				functions: [toolDefinition.function],
				tools: [toolDefinition],
				tool_choice: { mode: "function", function_name: "search_docs" },
			}),
		);

		assert.deepEqual(received, {
			name: "Support Prompt",
			collection_id: "collection-1",
			string: "Help the customer",
			parameters: {},
			virtual_key: "vk-support",
			ai_model_id: "model-1",
			finetune_id: "finetune-1",
			version_description: "Initial version",
			template_metadata: { app: "support", env: "prod" },
			functions: [toolDefinition.function],
			tools: [toolDefinition],
			tool_choice: {
				type: "function",
				function: { name: "search_docs" },
			},
		});
		assert.equal(payload.id, "prompt-1");
		assert.equal(payload.version_id, "version-1");
	});

	it("rejects creation without a model or template before calling the service", async () => {
		let createCalled = false;
		const callback = promptCallbacks({
			createPrompt: async () => {
				createCalled = true;
			},
		}).get("create_prompt");
		assert.ok(callback, "expected create_prompt to be registered");

		await assert.rejects(
			() =>
				callback({
					name: "Invalid Prompt",
					collection_id: "collection-1",
					parameters: {},
					virtual_key: "vk-support",
				}),
			(error: Error) => {
				assert.match(error.message, /model, ai_model_id, or finetune_id/);
				assert.match(error.message, /either string or messages/);
				return true;
			},
		);
		assert.equal(createCalled, false);
	});
});

describe("prompt update and lifecycle tools", () => {
	it("forwards every supported update field and normalizes tool choice", async () => {
		let received:
			| { promptId: string; payload: Record<string, unknown> }
			| undefined;
		const callback = promptCallbacks({
			updatePrompt: async (
				promptId: string,
				payload: Record<string, unknown>,
			) => {
				received = { promptId, payload };
				return {
					id: promptId,
					slug: "renamed-prompt",
					prompt_version_id: "version-2",
					object: "prompt",
				};
			},
		}).get("update_prompt");
		assert.ok(callback, "expected update_prompt to be registered");

		const fn = { name: "lookup_ticket", description: "Find a ticket" };
		const tool = { type: "function", function: fn };
		const payload = parseToolResult(
			await callback({
				prompt_id: "prompt-1",
				name: "Renamed Prompt",
				collection_id: "collection-2",
				string: "New template",
				parameters: { locale: "en" },
				model: "gpt-4.1",
				is_raw_template: true,
				virtual_key: "vk-support",
				version_description: "Second version",
				template_metadata: { env: "prod" },
				functions: [fn],
				tools: [tool],
				tool_choice: { mode: "none" },
			}),
		);

		assert.deepEqual(received, {
			promptId: "prompt-1",
			payload: {
				name: "Renamed Prompt",
				collection_id: "collection-2",
				string: "New template",
				parameters: { locale: "en" },
				model: "gpt-4.1",
				is_raw_template: true,
				virtual_key: "vk-support",
				version_description: "Second version",
				template_metadata: { env: "prod" },
				functions: [fn],
				tools: [tool],
				tool_choice: "none",
			},
		});
		assert.equal(payload.new_version_id, "version-2");
	});

	it("deletes a prompt and returns an explicit success result", async () => {
		const deleted: string[] = [];
		const callback = promptCallbacks({
			deletePrompt: async (promptId: string) => {
				deleted.push(promptId);
				return {};
			},
		}).get("delete_prompt");
		assert.ok(callback, "expected delete_prompt to be registered");

		const payload = parseToolResult(await callback({ prompt_id: "prompt-1" }));
		assert.deepEqual(deleted, ["prompt-1"]);
		assert.equal(payload.success, true);
	});

	it("publishes the requested prompt version", async () => {
		let received: unknown;
		const callback = promptCallbacks({
			publishPrompt: async (promptId: string, payload: unknown) => {
				received = { promptId, payload };
				return {};
			},
		}).get("publish_prompt");
		assert.ok(callback, "expected publish_prompt to be registered");

		const payload = parseToolResult(
			await callback({ prompt_id: "prompt-1", version: 3 }),
		);
		assert.deepEqual(received, {
			promptId: "prompt-1",
			payload: { version: 3 },
		});
		assert.equal(payload.published_version, 3);
	});

	it("updates a prompt version label, including clearing it with null", async () => {
		let received: unknown;
		const callback = promptCallbacks({
			updatePromptVersion: async (
				promptId: string,
				versionId: string,
				payload: unknown,
			) => {
				received = { promptId, versionId, payload };
				return { success: true };
			},
		}).get("update_prompt_version");
		assert.ok(callback, "expected update_prompt_version to be registered");

		const payload = parseToolResult(
			await callback({
				prompt_id: "prompt-1",
				version_id: "version-2",
				label_id: null,
			}),
		);
		assert.deepEqual(received, {
			promptId: "prompt-1",
			versionId: "version-2",
			payload: { label_id: null },
		});
		assert.equal(payload.success, true);
	});
});

describe("prompt rendering and execution tools", () => {
	it("renders variables with hyperparameter overrides", async () => {
		let received: unknown;
		const callback = promptCallbacks({
			renderPrompt: async (promptId: string, payload: unknown) => {
				received = { promptId, payload };
				return {
					success: true,
					data: {
						messages: [{ role: "user", content: "Hello Ada" }],
						model: "gpt-4.1",
						max_tokens: 300,
						temperature: 0.2,
						top_p: 0.9,
					},
				};
			},
		}).get("render_prompt");
		assert.ok(callback, "expected render_prompt to be registered");

		const payload = parseToolResult(
			await callback({
				prompt_id: "prompt-1",
				variables: { name: "Ada", active: true, retries: 2 },
				hyperparameters: { max_tokens: 300, temperature: 0.2 },
			}),
		);
		assert.deepEqual(received, {
			promptId: "prompt-1",
			payload: {
				variables: { name: "Ada", active: true, retries: 2 },
				hyperparameters: { max_tokens: 300, temperature: 0.2 },
			},
		});
		assert.deepEqual(payload.rendered_messages, [
			{ role: "user", content: "Hello Ada" },
		]);
		assert.deepEqual(payload.hyperparameters, {
			max_tokens: 300,
			temperature: 0.2,
			top_p: 0.9,
		});
	});

	it("returns the first completion choice and token usage", async () => {
		let received: unknown;
		const callback = promptCallbacks({
			runPromptCompletion: async (promptId: string, payload: unknown) => {
				received = { promptId, payload };
				return {
					id: "completion-1",
					object: "chat.completion",
					created: 1,
					model: "gpt-4.1",
					choices: [
						{
							index: 0,
							message: { role: "assistant", content: "Hello Ada" },
							finish_reason: "stop",
						},
					],
					usage: {
						prompt_tokens: 10,
						completion_tokens: 2,
						total_tokens: 12,
					},
				};
			},
		}).get("run_prompt_completion");
		assert.ok(callback, "expected run_prompt_completion to be registered");

		const metadata = { client_id: "client-1", app: "support", env: "prod" };
		const payload = parseToolResult(
			await callback({
				prompt_id: "prompt-1",
				variables: { name: "Ada" },
				metadata,
				hyperparameters: { temperature: 0 },
			}),
		);
		assert.deepEqual(received, {
			promptId: "prompt-1",
			payload: {
				variables: { name: "Ada" },
				metadata,
				hyperparameters: { temperature: 0 },
				stream: false,
			},
		});
		assert.equal(payload.response, "Hello Ada");
		assert.equal(payload.finish_reason, "stop");
		assert.deepEqual(payload.usage, {
			prompt_tokens: 10,
			completion_tokens: 2,
			total_tokens: 12,
		});
	});

	it("returns null response metadata when completion choices and usage are absent", async () => {
		const callback = promptCallbacks({
			runPromptCompletion: async () => ({
				id: "completion-empty",
				model: "gpt-4.1",
				choices: [],
				usage: undefined,
			}),
		}).get("run_prompt_completion");
		assert.ok(callback, "expected run_prompt_completion to be registered");

		const payload = parseToolResult(
			await callback({
				prompt_id: "prompt-1",
				variables: {},
				metadata: { client_id: "client-1", app: "support", env: "prod" },
			}),
		);
		assert.equal(payload.response, null);
		assert.equal(payload.finish_reason, null);
		assert.equal(payload.usage, null);
	});
});

describe("prompt workflow tools", () => {
	it("summarizes prompt version history and truncates long templates", async () => {
		const callback = promptCallbacks({
			listPromptVersions: async () => [
				{
					id: "version-1",
					prompt_id: "prompt-1",
					prompt_template: "x".repeat(201),
					prompt_version: 1,
					prompt_description: "Initial",
					label_id: "label-1",
					created_at: "2026-01-01T00:00:00.000Z",
					status: "active",
					object: "prompt",
				},
				{
					id: "version-2",
					prompt_id: "prompt-1",
					prompt_template: { string: "Short template" },
					prompt_version: 2,
					created_at: "2026-01-02T00:00:00.000Z",
					status: "archived",
					object: "prompt",
				},
			],
		}).get("list_prompt_versions");
		assert.ok(callback, "expected list_prompt_versions to be registered");

		const payload = parseToolResult(await callback({ prompt_id: "prompt-1" }));
		const versions = payload.versions as Array<Record<string, unknown>>;
		const longPreview = versions[0]?.template_preview;
		assert.equal(payload.total_versions, 2);
		assert.ok(typeof longPreview === "string");
		assert.equal(longPreview.length, 203);
		assert.match(longPreview, /\.\.\.$/);
		assert.equal(versions[1]?.template_preview, "Short template");
	});

	it("forwards migration options and presents the resulting action", async () => {
		let received: Record<string, unknown> | undefined;
		const callback = promptCallbacks({
			migratePrompt: async (payload: Record<string, unknown>) => {
				received = payload;
				return {
					action: "updated",
					dry_run: false,
					message: "Updated prompt",
					prompt_id: "prompt-1",
					slug: "support-prompt",
					version_id: "version-2",
				};
			},
		}).get("migrate_prompt");
		assert.ok(callback, "expected migrate_prompt to be registered");

		const fn = { name: "search_docs" };
		const tool = { type: "function", function: fn };
		const payload = parseToolResult(
			await callback({
				name: "Support Prompt",
				app: "support",
				env: "prod",
				collection_id: "collection-1",
				string: "Help the customer",
				parameters: {},
				virtual_key: "vk-support",
				model: "gpt-4.1",
				is_raw_template: true,
				version_description: "Release",
				template_metadata: { owner: "support-team" },
				functions: [fn],
				tools: [tool],
				tool_choice: { mode: "auto" },
				dry_run: false,
			}),
		);

		assert.deepEqual(received, {
			name: "Support Prompt",
			app: "support",
			env: "prod",
			collection_id: "collection-1",
			string: "Help the customer",
			parameters: {},
			virtual_key: "vk-support",
			model: "gpt-4.1",
			is_raw_template: true,
			version_description: "Release",
			template_metadata: { owner: "support-team" },
			functions: [fn],
			tools: [tool],
			tool_choice: "auto",
			dry_run: false,
		});
		assert.equal(payload.action, "updated");
		assert.equal(payload.version_id, "version-2");
	});

	it("promotes a prompt and returns source and target version identifiers", async () => {
		let received: unknown;
		const callback = promptCallbacks({
			promotePrompt: async (payload: unknown) => {
				received = payload;
				return {
					source_prompt_id: "source-1",
					source_version_id: "source-version-2",
					target_prompt_id: "target-1",
					target_version_id: "target-version-3",
					action: "updated",
					promoted_at: "2026-08-11T00:00:00.000Z",
				};
			},
		}).get("promote_prompt");
		assert.ok(callback, "expected promote_prompt to be registered");

		const payload = parseToolResult(
			await callback({
				source_prompt_id: "source-1",
				target_collection_id: "production",
				target_name: "Support Production",
				target_env: "prod",
				virtual_key: "vk-prod",
			}),
		);
		assert.deepEqual(received, {
			source_prompt_id: "source-1",
			target_collection_id: "production",
			target_name: "Support Production",
			target_env: "prod",
			virtual_key: "vk-prod",
		});
		assert.deepEqual(payload.source, {
			prompt_id: "source-1",
			version_id: "source-version-2",
		});
		assert.deepEqual(payload.target, {
			prompt_id: "target-1",
			version_id: "target-version-3",
			action: "updated",
		});
	});

	it("returns billing metadata validation errors and warnings", async () => {
		let received: unknown;
		const callback = promptCallbacks({
			validateBillingMetadata: (payload: unknown) => {
				received = payload;
				return {
					valid: false,
					errors: ["client_id is required"],
					warnings: ["project_id is recommended"],
				};
			},
		}).get("validate_completion_metadata");
		assert.ok(
			callback,
			"expected validate_completion_metadata to be registered",
		);

		const input = { app: "support", env: "prod" };
		const payload = parseToolResult(await callback(input));
		assert.deepEqual(received, input);
		assert.equal(payload.valid, false);
		assert.deepEqual(payload.errors, ["client_id is required"]);
		assert.deepEqual(payload.warnings, ["project_id is recommended"]);
		assert.deepEqual(payload.metadata, input);
	});
});

describe("configuration query tools", () => {
	it("returns curated configuration summaries", async () => {
		let received: unknown;
		const callback = configCallbacks({
			listConfigs: async (params: unknown) => {
				received = params;
				return {
					total: 1,
					data: [
						{
							id: "config-1",
							name: "Production",
							slug: "production",
							workspace_id: "workspace-1",
							status: "active",
							is_default: 1,
							created_at: "2026-01-01T00:00:00.000Z",
							last_updated_at: "2026-01-02T00:00:00.000Z",
							owner_id: "user-1",
							updated_by: "user-2",
							object: "config",
						},
					],
				};
			},
		}).get("list_configs");
		assert.ok(callback, "expected list_configs to be registered");

		const payload = parseToolResult(
			await callback({ current_page: 2, page_size: 25 }),
		);
		assert.deepEqual(received, { current_page: 2, page_size: 25 });
		assert.equal(payload.total, 1);
		assert.deepEqual(payload.configurations, [
			{
				id: "config-1",
				name: "Production",
				slug: "production",
				workspace_id: "workspace-1",
				status: "active",
				is_default: 1,
				created_at: "2026-01-01T00:00:00.000Z",
				last_updated_at: "2026-01-02T00:00:00.000Z",
				owner_id: "user-1",
				updated_by: "user-2",
			},
		]);
	});

	it("returns nested routing, retry, cache, and target details", async () => {
		const callback = configCallbacks({
			getConfig: async () => ({
				id: "config-1",
				slug: "production",
				name: "Production",
				status: "active",
				config: {
					cache: { mode: "semantic", max_age: 600 },
					retry: { attempts: 3, on_status_codes: [429, 500] },
					strategy: { mode: "fallback" },
					targets: [{ provider: "openai", virtual_key: "vk-openai" }],
				},
			}),
		}).get("get_config");
		assert.ok(callback, "expected get_config to be registered");

		const payload = parseToolResult(await callback({ slug: "production" }));
		assert.deepEqual(payload.config, {
			cache: { mode: "semantic", max_age: 600 },
			retry: { attempts: 3, on_status_codes: [429, 500] },
			strategy: { mode: "fallback" },
			targets: [{ provider: "openai", virtual_key: "vk-openai" }],
		});
	});
});

describe("configuration mutation tools", () => {
	it("builds every supported configuration setting for creation", async () => {
		let received: unknown;
		const callback = configCallbacks({
			createConfig: async (payload: unknown) => {
				received = payload;
				return { id: "config-1", version_id: "version-1" };
			},
		}).get("create_config");
		assert.ok(callback, "expected create_config to be registered");

		const payload = parseToolResult(
			await callback({
				name: "Production",
				workspace_id: "workspace-1",
				cache_mode: "semantic",
				cache_max_age: 600,
				retry_attempts: 3,
				retry_on_status_codes: [429, 500],
				strategy_mode: "fallback",
				targets: [{ provider: "openai", virtual_key: "vk-openai" }],
			}),
		);
		assert.deepEqual(received, {
			name: "Production",
			workspace_id: "workspace-1",
			config: {
				cache: { mode: "semantic", max_age: 600 },
				retry: { attempts: 3, on_status_codes: [429, 500] },
				strategy: { mode: "fallback" },
				targets: [{ provider: "openai", virtual_key: "vk-openai" }],
			},
		});
		assert.equal(payload.id, "config-1");
		assert.equal(payload.version_id, "version-1");
	});

	it("rejects creation without settings or with an empty routing target", async () => {
		let createCalled = false;
		const callback = configCallbacks({
			createConfig: async () => {
				createCalled = true;
			},
		}).get("create_config");
		assert.ok(callback, "expected create_config to be registered");

		await assert.rejects(
			() => callback({ name: "Empty" }),
			/At least one config setting/,
		);
		await assert.rejects(
			() => callback({ name: "Invalid Target", targets: [{}] }),
			/at least provider or virtual_key/,
		);
		assert.equal(createCalled, false);
	});

	it("updates name and status without replacing untouched config settings", async () => {
		let received: unknown;
		const callback = configCallbacks({
			updateConfig: async (slug: string, payload: unknown) => {
				received = { slug, payload };
				return {
					success: true,
					version_id: "version-2",
				};
			},
		}).get("update_config");
		assert.ok(callback, "expected update_config to be registered");

		const payload = parseToolResult(
			await callback({
				slug: "production",
				name: "Production v2",
				status: "inactive",
			}),
		);
		assert.deepEqual(received, {
			slug: "production",
			payload: { name: "Production v2", status: "inactive" },
		});
		assert.equal(payload.success, true);
		assert.equal(payload.version_id, "version-2");
	});

	it("deletes a configuration and preserves the service success flag", async () => {
		const deleted: string[] = [];
		const callback = configCallbacks({
			deleteConfig: async (slug: string) => {
				deleted.push(slug);
				return { success: true };
			},
		}).get("delete_config");
		assert.ok(callback, "expected delete_config to be registered");

		const payload = parseToolResult(await callback({ slug: "production" }));
		assert.deepEqual(deleted, ["production"]);
		assert.equal(payload.success, true);
	});

	it("returns curated configuration version history", async () => {
		const callback = configCallbacks({
			listConfigVersions: async () => ({
				total: 1,
				data: [
					{
						version_id: "version-1",
						config: { strategy: { mode: "fallback" } },
						created_at: "2026-01-01T00:00:00.000Z",
						updated_by: "user-1",
					},
				],
			}),
		}).get("list_config_versions");
		assert.ok(callback, "expected list_config_versions to be registered");

		const payload = parseToolResult(await callback({ slug: "production" }));
		assert.equal(payload.total, 1);
		assert.deepEqual(payload.versions, [
			{
				version_id: "version-1",
				config: { strategy: { mode: "fallback" } },
				created_at: "2026-01-01T00:00:00.000Z",
				updated_by: "user-1",
			},
		]);
	});
});
