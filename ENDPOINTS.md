# Portkey Admin API endpoints and MCP tools

Generated from the registered tool catalog by `npm run generate:endpoints`.
Route mappings were reviewed against the official Portkey OpenAPI on 2026-08-28.

- Base URL: `https://api.portkey.ai/v1`
- Authentication: `x-portkey-api-key`
- Public catalog exception: `get_model_pricing` uses `https://api.portkey.ai` without authentication
- Total: 178 tools across 20 domains
- Enterprise-gated names and counts are maintained in `src/tools/index.ts` and verified against README by `npm run verify:readme-tools`

The route lists are domain-level service routes. The tool tables are the complete
MCP catalog and preserve the actual selection guidance exposed through
`tools/list`. A tool can perform a workflow across several listed routes rather
than mapping one-to-one to one HTTP endpoint.

## Workflow-only and multi-request tools

| Tool | Behavior |
|---|---|
| `migrate_prompt` | Pages exact-name prompt lookup, then creates, updates, or no-ops after comparing every supplied execution field. |
| `promote_prompt` | Reads the source and exact target, then creates or updates the target while honoring an explicit destination virtual-key override. |
| `validate_completion_metadata` | Validates billing metadata locally and makes no Portkey request. |
| `get_prompt` | Combines prompt detail with a separate full version-history read. |
| `get_model_pricing` | Reads the unauthenticated public catalog origin instead of the credentialed `/v1` base. |

## Analytics endpoint matrix

| Tool | Current route |
|---|---|
| `get_cost_analytics` | GET `/analytics/graphs/cost` |
| `get_request_analytics` | GET `/analytics/graphs/requests` |
| `get_token_analytics` | GET `/analytics/graphs/tokens` |
| `get_latency_analytics` | GET `/analytics/graphs/latency` |
| `get_error_analytics` | GET `/analytics/graphs/errors` |
| `get_error_rate_analytics` | GET `/analytics/graphs/errors/rate` |
| `get_cache_hit_latency` | GET `/analytics/graphs/cache/latency` |
| `get_cache_hit_rate` | GET `/analytics/graphs/cache/hit-rate` |
| `get_cache_summary` | GET `/analytics/summary/cache` |
| `get_users_analytics` | GET `/analytics/graphs/users` |
| `get_error_stacks_analytics` | GET `/analytics/graphs/errors/stacks` |
| `get_error_status_codes_analytics` | GET `/analytics/graphs/errors/status-codes` |
| `get_user_requests_analytics` | GET `/analytics/graphs/users/requests` |
| `get_rescued_requests_analytics` | GET `/analytics/graphs/requests/rescued` |
| `get_feedback_analytics` | GET `/analytics/graphs/feedbacks` |
| `get_feedback_models_analytics` | GET `/analytics/graphs/feedbacks/ai-models` |
| `get_feedback_scores_analytics` | GET `/analytics/graphs/feedbacks/scores` |
| `get_feedback_weighted_analytics` | GET `/analytics/graphs/feedbacks/weighted` |
| `get_analytics_group_users` | GET `/analytics/groups/users` |
| `get_analytics_group_models` | GET `/analytics/groups/ai-models` |
| `get_analytics_group_metadata` | GET `/analytics/groups/metadata/{key}` |
| `get_analytics_group_providers` | GET `/analytics/groups/provider` |

<!-- tool-catalog:start -->
## users (10)

Routes:

- GET/PUT/DELETE `/admin/users/{userId}`; GET `/admin/users`
- POST/GET `/admin/users/invites`; GET/DELETE `/admin/users/invites/{inviteId}`; POST `/admin/users/invites/{inviteId}/resend`
- GET `/analytics/groups/users`

| Tool | Selection guidance and result |
|---|---|
| `list_all_users` | List accepted org users with id, name, email, role, and timestamps. Use this to find a user_id before get_user, update_user, delete_user, or add_workspace_member; use list_user_invites for pending invitations. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `invite_user` | Invite a new org user and optionally provision workspace access and an API key in one call. Workspace assignments apply only after acceptance; use add_workspace_member or update_workspace_member later for follow-up changes. |
| `get_user_stats` | Return per-user request and cost analytics for a required time range. This is usage-by-user, not population metrics; use get_users_analytics for active-user or cohort trends. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_user` | Get one accepted user by id and return their profile, role, and timestamps. Use list_all_users to find the id if you only have a name or email, and get_user_invite for pending invitations. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `update_user` | Update a user's first name, last name, or organization role by id. Email and workspace roles are not editable here; use update_workspace_member for workspace membership changes. |
| `delete_user` | Delete a user from the org by id. This is permanent, removes org and workspace memberships, revokes API keys, and ends active sessions; use delete_user_invite for pending invites instead. |
| `list_user_invites` | List pending and sent invitations with id, email, role, status, and expiry. Use this to check invite state; use list_all_users for users who already accepted. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_user_invite` | Get one invitation by invite id and return its email, role, status, and expiry. Use this for pending invites only; use get_user for accepted users. |
| `delete_user_invite` | Delete a pending invite and revoke its invite link. This does not affect existing users; use delete_user for full user removal. |
| `resend_user_invite` | Resend the email for a pending invite that has not been accepted, unlike invite_user which creates a new invite. This sends a fresh email without modifying the invite record, expiry, or role; use get_user_invite first if you are unsure whether the invite still exists and list_user_invites to discover invite_ids. |

## workspaces (14)

Routes:

- GET/POST `/admin/workspaces`; GET/PUT/DELETE `/admin/workspaces/{workspaceId}`
- GET/POST `/admin/workspaces/{workspaceId}/users`; GET/PUT/DELETE `/admin/workspaces/{workspaceId}/users/{userId}`
- GET/POST `/scim/workspaces`; DELETE `/scim/workspaces/{mappingId}`; GET `/scim/groups`

| Tool | Selection guidance and result |
|---|---|
| `list_scim_workspace_mappings` | List identity-provider SCIM group mappings that automatically grant Portkey workspace roles. Use it to audit provisioned access or obtain mapping_id before delete_scim_workspace_mapping; filter by workspace, group, or role and page through large directories. This reads mappings only and does not query individual workspace members. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `create_scim_workspace_mapping` | Map one identity-provider SCIM group to a Portkey workspace role so current and future group members receive access automatically. Provide exactly one of scim_group_id or scim_group_name; a name can pre-create the Portkey SCIM group before the IdP provisions it. Use list_scim_groups to discover existing groups and list_workspaces for the workspace ID. This changes access provisioning and is distinct from add_workspace_member, which grants one user directly. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `delete_scim_workspace_mapping` | Delete a SCIM group-to-workspace mapping by mapping_id and stop future group updates from affecting that workspace. Existing provisioned members remain in the workspace and must be managed separately. Inspect list_scim_workspace_mappings first; this does not delete the identity-provider group or the Portkey workspace. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `list_scim_groups` | Search and page through identity-provider groups synchronized to Portkey over SCIM. Use this to resolve a group ID or exact display name before create_scim_workspace_mapping; it reads directory groups only and does not show their workspace mappings or individual members. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `list_workspaces` | List workspaces with id, name, slug, default settings, and timestamps. Use this to find a workspace_id before get_workspace, update_workspace, add_workspace_member, or remove_workspace_member. |
| `get_workspace` | Get one workspace by id and return its full details, including defaults and the complete member list. Use this when you need membership detail; use list_workspaces for an overview. |
| `create_workspace` | Create a workspace to isolate resources, API keys, and team members. If slug is omitted it is auto-generated from the name; returns the new workspace id, name, and slug. |
| `update_workspace` | Update a workspace's name, slug, description, default flag, or metadata by id, unlike update_workspace_member which changes role assignments within a workspace. Only provided fields change and updates take effect immediately; changing the slug can break URLs, API key references, and other external links, so confirm no dependencies first. |
| `delete_workspace` | Delete a workspace by id. This is permanent and removes the workspace, its members, configs, API keys, and resources. |
| `add_workspace_member` | Add an existing org user to a workspace with a role. Requires a UUID user_id; use list_all_users to find it, and invite_user first if the person is not yet in the org. |
| `list_workspace_members` | List every member in a workspace with organization role, workspace role, status, and timestamps. Use this to find a user_id before get_workspace_member, update_workspace_member, or remove_workspace_member. |
| `get_workspace_member` | Get one workspace member by workspace_id and user_id. Use this when you already know both IDs; use list_workspace_members to browse the full roster. |
| `update_workspace_member` | Update a workspace member's role by workspace_id and user_id. Only the role changes here; use list_workspace_members or get_workspace_member to confirm the current assignment first. |
| `remove_workspace_member` | Remove a user from a workspace and revoke workspace access. This does not delete the user from the organization; use delete_user for full removal. |

## configs (6)

Routes:

- GET/POST `/configs`; GET/PUT/DELETE `/configs/{slug}`; GET `/configs/{slug}/versions`

| Tool | Selection guidance and result |
|---|---|
| `list_configs` | List configs in the org with id, slug, name, status, workspace, and timestamps. Use this summary view to find a slug; use get_config for the full routing, cache, retry, and target settings before updating or deleting. |
| `get_config` | Get one config by slug and return its routing, cache, retry, and target settings. Requires a known slug; use list_configs to discover one before editing. |
| `create_config` | Create a config that defines routing, cache, retry, and targets for requests; use update_config to modify an existing one and list_config_versions for history. At least one setting is required, new configs become active immediately once referenced by a key or prompt, and the call returns the new id and version_id. |
| `update_config` | Update a config by slug; every call creates a new config version rather than overwriting, so earlier versions stay recoverable via list_config_versions. Only provided fields change: name, status, and all routing/cache/retry settings (cache_mode, cache_max_age, retry_attempts, retry_on_status_codes, strategy_mode, targets) are editable, while the slug stays fixed. Changes apply immediately to every API key and prompt referencing the config. Returns the update acknowledgement and new version_id. |
| `delete_config` | Delete a config by slug. This is permanent, removes all versions, and breaks anything still pointing at that slug; check list_config_versions first. |
| `list_config_versions` | List every version of a config with version_id, structured config payload, updater, and timestamp. Use this to audit history or compare revisions before update_config or delete_config. |

## deployments (5)

Routes:

- GET/POST `/deployments`; GET/PUT/DELETE `/deployments/{id}`. DELETE archives; deprecated `/ping` is intentionally omitted.

| Tool | Selection guidance and result |
|---|---|
| `list_deployments` | Enterprise-gated. List registered self-hosted Gateway deployments with status, type, default state, and connection health. Use this before get_deployment, update_deployment, or archive_deployment to resolve a deployment ID. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `register_deployment` | Enterprise-gated. Register a self-hosted Gateway deployment when onboarding a new control-plane target; use list_deployments for existing registrations. The response can contain authentication and registry credentials exactly once, exposed to this MCP transcript, so store them securely immediately and never log them. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_deployment` | Enterprise-gated. Get one registered Gateway deployment by UUID, or use self when authenticating as that deployment. Use list_deployments to resolve an ID; read responses contain only masked authentication and registry credential values. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `update_deployment` | Enterprise-gated. Update a registered Gateway deployment, its workspace or JWT-sub access, or rotate its authentication secret. Use get_deployment first to inspect current settings. Rotation returns the new secret once in this MCP transcript, so store it securely immediately. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `archive_deployment` | Enterprise-gated. Archive a registered Gateway deployment by UUID. Use get_deployment first to confirm the target. Portkey soft-deletes the record; this stops treating it as active but does not permanently remove its history. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |

## keys (11)

Routes:

- GET/POST `/virtual-keys`; GET/PUT/DELETE `/virtual-keys/{slug}`
- GET `/api-keys`; POST `/api-keys/{type}/{subType}`; GET/PUT/DELETE `/api-keys/{id}`; POST `/api-keys/{id}/rotate`

| Tool | Selection guidance and result |
|---|---|
| `list_virtual_keys` | List provider API keys stored as virtual keys in your Portkey org. Use this to find slugs before wiring prompts/configs or auditing limits. Returns total plus name, slug, status, usage limits, rate limits, reset state, and model config. |
| `create_virtual_key` | Store a provider API key as a virtual key. The raw key is encrypted and only returned at creation time, so save the returned slug and use it in prompts/configs. Optional usage and rate limits apply immediately, and the tool returns the new slug. |
| `get_virtual_key` | Fetch one virtual key by slug, including metadata, a masked secret, limits, status, and model config. Use this before updating or to inspect the current configuration. |
| `update_virtual_key` | Update a virtual key's name, secret, note, or limits. Rotating the key takes effect immediately, and limit changes apply to downstream prompts and configs using this slug. Returns success when Portkey accepts the update. |
| `delete_virtual_key` | Delete a virtual key by slug. This is irreversible and will break prompts and configs that reference the slug, so confirm no active dependencies first. Returns success after removal. |
| `create_api_key` | Create a Portkey API key for auth. Org keys grant broader access; workspace keys are scoped. WARNING: The key secret is returned ONCE in the tool result and will be visible in MCP transcripts and LLM context — store it securely immediately. Using the key grants access immediately according to its scopes, defaults, and limits. Workspace keys require workspace_id and user keys require user_id. |
| `list_api_keys` | List Portkey API keys for auditing access, scopes, defaults, limits, and expiration. Use this for API keys only; use list_virtual_keys for provider keys. Returns total plus id, type, status, workspace/user scope, limits, defaults, alert emails, and creation mode. |
| `get_api_key` | Fetch one API key by UUID without revealing the secret. Use this to inspect scopes, defaults, limits, expiration, and reset state before changing access. |
| `update_api_key` | Update an API key's name, description, scopes, defaults, or limits, unlike delete_api_key which revokes it or create_api_key which issues a new one. Changes take effect immediately for downstream callers, type and sub-type stay fixed after creation, and the call returns success without rotating the secret. |
| `delete_api_key` | Delete an API key by UUID. This cannot be undone, revokes access immediately, and can break active sessions using the key. Returns success after revocation. |
| `rotate_api_key` | Rotate an API key without changing its identity or scopes. The new secret is returned once and exposed to this MCP transcript, while the previous secret remains valid until key_transition_expires_at. Store the new key securely, update callers during the transition window, and never log either secret. |

## collections (5)

Routes:

- GET/POST `/collections`; GET/PUT/DELETE `/collections/{collectionId}`

| Tool | Selection guidance and result |
|---|---|
| `list_collections` | List prompt collections in the workspace, optionally filtering by name or workspace. Returns ids, names, slugs, and timestamps so you can choose a collection_id before create_prompt, get_collection, or list_prompts. |
| `create_collection` | Create a new prompt collection for organizing prompts by app. Use this when you need a new namespace before create_prompt; returns the collection id and slug, and does not move any prompts. |
| `get_collection` | Fetch one collection by id or slug and return its name, slug, workspace, and timestamps. Use list_collections when browsing and get_collection when you already know the target. |
| `update_collection` | Update a collection's name or description only. This does not move prompts or change membership, so use it for metadata changes rather than reorganization. |
| `delete_collection` | Delete a prompt collection by ID. This cannot be undone; prompts stay in the workspace but lose their collection grouping, so reassign them first if organization matters. |

## prompts (14)

Routes:

- GET/POST `/prompts`; GET/PUT/DELETE `/prompts/{promptId}`
- GET `/prompts/{promptId}/versions`; GET/PUT `/prompts/{promptId}/versions/{versionId}`; PUT `/prompts/{promptId}/makeDefault`
- POST `/prompts/{promptId}/render`; POST `/prompts/{promptId}/completions`

| Tool | Selection guidance and result |
|---|---|
| `create_prompt` | Create a new prompt template and initial version. Use this for first-time setup; use migrate_prompt for idempotent CI/CD flows. Accepts plain text or structured chat messages, creates a new version immediately, and returns the prompt id, slug, and version id. For multi-message chat prompts pass messages (preferred) or a JSON-encoded array as string. |
| `list_prompts` | List prompts across the workspace, with optional collection, workspace, or search filters. Returns a paginated summary with id, name, slug, model, and status so you can choose a prompt_id before get_prompt, update_prompt, or render_prompt. |
| `get_prompt` | Fetch a prompt's full definition, active version, and version history. Use this before updating, publishing, rendering, or copying a prompt when you need the stored template and metadata. For multi-message chat prompts pass messages (preferred) or a JSON-encoded array as string. |
| `update_prompt` | Update an existing prompt and create a new archived version. Only provided fields change, and publish_prompt is what makes the new version active. For multi-message chat prompts pass messages (preferred) or a JSON-encoded array as string. |
| `delete_prompt` | Delete a prompt and all its versions by id. This cannot be undone, immediately breaks callers using the slug, and should only be used after checking list_prompt_versions or confirming you do not need an audit trail. |
| `publish_prompt` | Publish a specific version of a prompt as the active default, unlike promote_prompt which copies across environments or update_prompt which creates a new draft. This immediately routes all callers using the slug to that version and there is no rollback, so use list_prompt_versions to pick the version and update_prompt first if you need to create new content before promoting it. |
| `list_prompt_versions` | List all versions of one prompt, including version number, description, status, label, and a short template preview. Use this for history or to choose a version_id before publish_prompt or update_prompt_version. |
| `render_prompt` | Render a prompt by substituting variables and returning the final messages without calling the model. Use this to verify template output before a completion; run_prompt_completion is the tool that actually invokes the model. |
| `run_prompt_completion` | Execute a prompt against the configured model and return the completion. This makes a billable model call, so use render_prompt first when you want to check the template and validate_completion_metadata when billing fields are uncertain. |
| `migrate_prompt` | Create or update a prompt in one idempotent step for CI/CD and prompt-as-code flows, unlike create_prompt which always makes a new prompt. Looks up the prompt by name within collection_id: if missing it creates the prompt, if found with different content it adds a new version (nothing is overwritten), and if the content already matches it no-ops; dry_run reports what would happen without changing anything. Stores app/env in template_metadata; get collection_id from list_collections. Returns the action taken (created, updated, or unchanged), dry_run flag, message, prompt id, slug, and version id. |
| `promote_prompt` | Copy a prompt from one environment to another and create or update the target automatically. Use this for staged releases when you want the target prompt synchronized without manual edits, and it returns both source and target version ids. |
| `validate_completion_metadata` | Preflight billing metadata before run_prompt_completion. Validates required fields and values without making changes, so you can catch attribution errors before paying for the call. |
| `get_prompt_version` | Retrieve a specific prompt version by its version UUID. Use list_prompt_versions to find the id first; returns the template, parameters, and model config for that version. |
| `update_prompt_version` | Update a specific prompt version's label assignment. This only assigns or removes a label, and null clears the label after you look up ids with list_prompt_labels. |

## analytics (22)

Routes:

- See the analytics endpoint matrix below.

| Tool | Selection guidance and result |
|---|---|
| `get_cost_analytics` | Get cost time-series data with summary.total_cost, summary.average_cost_per_request, and per-bucket total/avg cost. Use this for spend analysis and spike detection; use get_token_analytics when you need token volume instead of monetary cost. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_request_analytics` | Get request-volume time-series data with summary.total_requests, summary.successful_requests, summary.failed_requests, and per-bucket total/success/failed counts. Use this for traffic and reliability trends; use get_error_analytics when you only need error counts. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_token_analytics` | Get token-usage time-series data with summary.total_tokens, summary.prompt_tokens, summary.completion_tokens, and per-bucket total/prompt/completion counts. Use this for consumption trends; use get_cost_analytics when you need spend instead of token volume. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_latency_analytics` | Get latency time-series data with summary.avg_latency_ms, summary.p50_latency_ms, summary.p90_latency_ms, summary.p99_latency_ms, and per-bucket latency percentiles in ms. Use this to spot slowdowns and regressions; use get_cache_hit_latency when you only want cache-hit latency. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_error_analytics` | Get error-count time-series data with summary.total_errors and per-bucket counts. Use this for high-level error trends; use get_error_rate_analytics for percentages, or get_error_status_codes_analytics and get_error_stacks_analytics for breakdowns. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_error_rate_analytics` | Get error-rate time-series data with summary.error_rate_percent and per-bucket percentages of total requests. Use this for reliability and SLA trends; use get_error_analytics for absolute error counts instead. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_cache_hit_latency` | Get cache-hit-only latency time-series data with summary.total_latency, summary.avg_latency, and per-bucket total/avg latency. Use this to evaluate cached-response speed; use get_latency_analytics for all requests. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_cache_hit_rate` | Get cache-effectiveness time-series data with summary.hit_rate, summary.total_hits, summary.total_misses, and per-bucket hits/misses/rate. Use this to measure cache effectiveness; use get_cache_hit_latency for speed rather than hit/miss ratio. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_cache_summary` | Enterprise-gated. Get cache summary metrics for one workspace and time range: hits, average cache-hit latency, total requests, and percentage speedup. Use the graph cache tools when you need changes over time instead of one aggregate. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_users_analytics` | Get user-growth time-series data with summary.total_active_users, summary.total_new_users, and per-bucket active/new user counts. Use this for growth and adoption trends; use get_user_requests_analytics for per-user traffic or get_analytics_group_users for per-user cost and token detail. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_analytics_group_users` | Get a paginated per-user breakdown with total_groups, group_count, and a users array containing request count, cost, and token usage. Use this for billing, audits, or top-consumer analysis; use get_users_analytics for aggregate active and new user trends. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_analytics_group_models` | Get a paginated per-model breakdown with total_groups, group_count, and a models array containing request count, cost, and token usage. Use this to compare model cost, popularity, and efficiency; use get_token_analytics or get_cost_analytics for time-series trends instead. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_analytics_group_providers` | Enterprise-gated. Get provider-grouped analytics for one workspace and time range with selectable metrics, ordering, pagination, and optional total count. Use this when comparing provider traffic or reliability; requested metric fields are preserved in each provider row. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_analytics_group_metadata` | Get a paginated metadata breakdown with total_groups, group_count, and a metadata_groups array grouped by the required metadata_key. Use this for custom breakdowns like per-environment or per-feature analysis; pass metadata_key in addition to the time window. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_error_stacks_analytics` | Get stacked error-series data grouped by HTTP status code over time, with summary and per-code series. Use this to see which error classes dominate; use get_error_status_codes_analytics for distinct-code distribution instead. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_error_status_codes_analytics` | Get HTTP error-code distribution time-series data with summary and per-code series. Use this to see which codes occur most often; use get_error_stacks_analytics for stacked or cumulative breakdowns. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_user_requests_analytics` | Get per-user request-count time-series data with counts grouped by user. Use this to find heavy users and traffic concentration; use get_users_analytics for aggregate active and new user trends instead. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_rescued_requests_analytics` | Get rescued-request time-series data showing requests recovered by retry or fallback handling. Use this only when your configs include resilience features, and use it to measure how often recovery logic saved requests. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_feedback_analytics` | Get feedback-submission time-series data with summary totals and per-bucket counts. Use this as the top-level feedback trend view; use get_feedback_models_analytics, get_feedback_scores_analytics, or get_feedback_weighted_analytics for breakdowns. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_feedback_models_analytics` | Get feedback time-series data grouped by model, with per-model counts over time. Use this to compare feedback volume and satisfaction across models; use get_feedback_analytics for the overall total instead. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_feedback_scores_analytics` | Get raw feedback-score distribution time-series data with per-score buckets. Use this to understand sentiment mix; use get_feedback_weighted_analytics for calibrated scores with weighting. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_feedback_weighted_analytics` | Get weighted feedback-score time-series data using the weight recorded at feedback creation. Use this for calibrated quality metrics; use get_feedback_scores_analytics for the raw unweighted distribution. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |

## guardrails (11)

Routes:

- GET/PUT `/admin/organisation/defaults`
- GET/PUT `/workspace-exclusions/{input-guardrails|output-guardrails}`
- GET/POST `/guardrails`; GET/PUT/DELETE `/guardrails/{guardrailId}`

| Tool | Selection guidance and result |
|---|---|
| `get_organisation_defaults` | Get the organisation-wide input and output guardrails that workspaces inherit by default. Use this before update_organisation_defaults or when auditing baseline enforcement; it does not include per-workspace exclusions, which are available from the directional exclusion list tools. Requires an organisation service API key with organisation_settings.read scope. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `update_organisation_defaults` | Replace the organisation-wide default input and/or output guardrail lists inherited by workspaces. Only supplied directions change, but enforcement updates immediately across non-excluded workspaces; inspect get_organisation_defaults and the directional workspace exclusions first. Repeating the same lists is safe. Requires an organisation service API key with organisation_settings.update scope. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `list_input_guardrail_workspace_exclusions` | List workspaces excluded from organisation-wide input guardrails for one organisation. Use this to audit exceptions or establish the current state before the matching update tool; it reads input exclusions only and does not return the organisation's default guardrail list. Requires an organisation service API key with organisation_exclusions.list scope. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `update_input_guardrail_workspace_exclusions` | Set workspace exclusions from organisation-wide input guardrails. Each entry excludes or restores one workspace; override_existing replaces prior states while the default merge behavior preserves unmentioned workspaces. Review the matching list tool first because enforcement changes immediately. Repeating the same states is safe. Requires an organisation service API key with organisation_exclusions.update scope. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `list_output_guardrail_workspace_exclusions` | List workspaces excluded from organisation-wide output guardrails for one organisation. Use this to audit exceptions or establish the current state before the matching update tool; it reads output exclusions only and does not return the organisation's default guardrail list. Requires an organisation service API key with organisation_exclusions.list scope. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `update_output_guardrail_workspace_exclusions` | Set workspace exclusions from organisation-wide output guardrails. Each entry excludes or restores one workspace; override_existing replaces prior states while the default merge behavior preserves unmentioned workspaces. Review the matching list tool first because enforcement changes immediately. Repeating the same states is safe. Requires an organisation service API key with organisation_exclusions.update scope. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `list_guardrails` | List guardrails in the org with id, slug, status, ownership, and optional workspace/org filters. Use this to find IDs and slugs before get_guardrail, update_guardrail, or delete_guardrail. |
| `get_guardrail` | Fetch one guardrail by id or slug with its full checks and actions; use list_guardrails to discover ids first. Use before update_guardrail or delete_guardrail when you need the exact enforcement policy, and returns the full check and action configuration alongside status and ownership. |
| `create_guardrail` | Create a guardrail with checks and actions for request filtering. Create it first, then reference it from configs; the new version becomes the policy anchor for downstream use. |
| `update_guardrail` | Update a guardrail's name, checks, or actions, unlike create_guardrail which registers a new one or delete_guardrail which removes it. This creates a new version that takes effect immediately for dependent configs, so review list_guardrails first; returns the updated id, slug, and version_id. |
| `delete_guardrail` | Delete a guardrail by id or slug. This is irreversible and removes the check from any configs that reference it, so review dependent configs first. |

## limits (12)

Routes:

- GET/POST `/policies/rate-limits`; GET/PUT/DELETE `/policies/rate-limits/{id}`
- GET/POST `/policies/usage-limits`; GET/PUT/DELETE `/policies/usage-limits/{id}`
- GET `/policies/usage-limits/{id}/entities`; PUT `/policies/usage-limits/{id}/entities/{entityId}/reset`

| Tool | Selection guidance and result |
|---|---|
| `list_rate_limits` | List rate-limit policies with their current condition, grouping, rate unit, target, status, and scope. Filter before retrieving or changing one policy, especially when archived policies should be included. |
| `get_rate_limit` | Get one rate-limit policy by id, including current conditions, grouping, unit, value, target, scope, and status. Pass archived status when retrieving a soft-deleted policy. |
| `create_rate_limit` | Create a request or token rate-limit policy. Conditions and grouping must be non-empty; target llm uses model/provider keys, while target mcp_tools uses MCP server and tool keys. |
| `update_rate_limit` | Update a rate-limit policy's name, unit, value, or non-empty conditions by id. The public contract does not allow changing its type, target, or grouping after creation. |
| `delete_rate_limit` | Delete a rate-limit policy by id. Portkey removes the active throttling policy immediately, so inspect dependent callers and the full policy before deleting it. |
| `list_usage_limits` | List cumulative cost or token usage-limit policies with current conditions, grouping, reset schedule, status, and scope. Filter by workspace, policy type, status, and pagination. |
| `get_usage_limit` | Get one cumulative usage-limit policy by id. Use list_usage_limits first when the id is unknown. Optionally include per-value usage counters and retrieve archived policies; scheduled reset timestamps are returned when present. |
| `create_usage_limit` | Create a cumulative cost or token usage-limit policy with non-empty conditions and grouping. A periodic reset can be weekly, monthly, or omitted for a cumulative lifetime limit. |
| `update_usage_limit` | Update a cumulative usage-limit policy's name, credit limit, alert threshold, reset schedule, or one grouped value's usage. Conditions and grouping aren't mutable in the public contract. |
| `delete_usage_limit` | Archive a cumulative usage-limit policy by id. The policy stops enforcing its budget but its historical record remains available through archived-status reads. |
| `list_usage_limit_entities` | List the values currently tracked by one usage-limit policy with each value key and current usage. Filter by active or exhausted state, search text, and pagination before resetting one counter. |
| `reset_usage_limit_entity` | Reset the current usage counter for one tracked usage-limit entity. This changes enforcement immediately for that exact policy and entity, so use the entity id returned by list_usage_limit_entities. |

## audit (1)

Routes:

- GET `/audit-logs`

| Tool | Selection guidance and result |
|---|---|
| `list_audit_logs` | List audit log events for a Portkey workspace or organization. Returns paginated action-level records with actor, resource, metadata, and timestamps for compliance or incident review; use this instead of analytics when you need individual events, not aggregates. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |

## labels (5)

Routes:

- GET/POST `/labels`; GET/PUT/DELETE `/labels/{labelId}`

| Tool | Selection guidance and result |
|---|---|
| `create_prompt_label` | Create a prompt label for tagging prompt versions such as production, staging, or experiment. Requires either organisation_id or workspace_id to set scope, returns the new label id, and does not assign it to any versions yet. |
| `list_prompt_labels` | List labels across the workspace or organisation, with optional search and scope filters. Returns ids, names, colors, status, and timestamps so you can choose a label_id before get_prompt_label or update_prompt_version. |
| `get_prompt_label` | Fetch one label's full definition, including scope, color, and status. Use this when you already know the label_id; list_prompt_labels is better for browsing candidates. |
| `update_prompt_label` | Update a prompt label's name, description, or color only, unlike update_prompt_version which changes which label a version carries. This takes effect immediately for all versions already tagged with the label, but does not reassign labels or touch history; use list_prompt_labels to find the label_id first. |
| `delete_prompt_label` | Delete a prompt label by ID. This cannot be undone; versions carrying the label lose it, and any workflow resolving by that label will need a replacement. |

## partials (7)

Routes:

- GET/POST `/prompts/partials`; GET/PUT/DELETE `/prompts/partials/{partialId}`
- GET `/prompts/partials/{partialId}/versions`; PUT `/prompts/partials/{partialId}/makeDefault`

| Tool | Selection guidance and result |
|---|---|
| `create_prompt_partial` | Create a reusable prompt partial for inclusion with {{> partial_name}}. Use this for shared snippets or macros; returns the partial id, slug, and version id, and the new version stays inactive until published. |
| `list_prompt_partials` | List partials across collections, with optional collection filtering. Returns ids, slugs, names, collections, and status so you can choose a prompt_partial_id before get_prompt_partial, update_prompt_partial, delete_prompt_partial, or publish_partial. |
| `get_prompt_partial` | Fetch a partial's content and current version details. Use this before embedding, updating, or checking what {{> partial_name}} resolves to; returns the stored string plus version metadata. |
| `update_prompt_partial` | Create a new version of a partial by updating its content or metadata. Only provided fields change, and the new version stays inactive until publish_partial makes it current. |
| `delete_prompt_partial` | Delete a prompt partial by ID. This cannot be undone, and prompts that reference it with {{> name}} will fail to render until you replace the reference. |
| `list_partial_versions` | List all versions for one partial, including version numbers, descriptions, status, and timestamps. Use this when you need history or want to choose a version_id before publish_partial. |
| `publish_partial` | Publish a specific partial version as the default, unlike update_prompt_partial which creates a new draft without activating it. Use after list_partial_versions to pick a version_id; this immediately changes what {{> partial_name}} resolves to for all prompts and replaces the previously active version without a rollback path. |

## tracing (2)

Routes:

- POST `/feedback`; PUT `/feedback/{id}`

| Tool | Selection guidance and result |
|---|---|
| `create_feedback` | Create feedback for a trace or request. Writes a new feedback record linked by trace_id, returns the created feedback IDs and status, and takes effect immediately; use update_feedback when correcting an existing record. |
| `update_feedback` | Update an existing feedback record by ID. Returns the updated status and feedback IDs, changes only value, weight, and metadata, and leaves the trace linkage immutable; use create_feedback only for a new record. |

## logging (10)

Routes:

- POST `/logs`; GET `/logs/{logId}`
- GET `/logs/exports/field-restrictions`; GET/POST `/logs/exports`; GET/PUT `/logs/exports/{exportId}`
- POST `/logs/exports/{exportId}/{start|cancel}`; GET `/logs/exports/{exportId}/download`

| Tool | Selection guidance and result |
|---|---|
| `get_log` | Get one gateway request log by ID, including its request, response, usage, cost, and metadata payload when available. For path_format v2, also provide the log's created_at timestamp. |
| `get_log_export_field_restrictions` | Get the organisation-managed fields that a workspace is restricted from including in log exports. Use before create_log_export or update_log_export to avoid requesting disallowed fields. Requires an API key with logs.export scope; completion-log fields may additionally require completion scope. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `insert_log` | Insert log records for requests that bypassed the gateway. This writes request, response, and trace metadata into Portkey immediately, and the call will fail if request_provider does not match a configured integration. Use the span fields to stitch trace hierarchies together. |
| `create_log_export` | Create a log export definition with filters and requested fields. This only sets up the export and does not start processing; call start_log_export next, then use get_log_export or download_log_export to inspect or retrieve the finished result. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `list_log_exports` | List log export jobs in a workspace with status, filters, and timestamps. Use this to find an export_id before calling get_log_export, start_log_export, cancel_log_export, or download_log_export. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `get_log_export` | Fetch one log export job by export_id and return its status, filters, requested fields, and file metadata. Use this when you already know the target; use list_log_exports for a workspace-wide overview. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `start_log_export` | Start processing a previously created log export job. This is asynchronous, only queues the export, and does not return rows or a download file; use get_log_export to poll progress and download_log_export after the job completes. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `cancel_log_export` | Cancel a pending or running log export job, unlike start_log_export which queues one or delete_integration which removes the source. This permanently stops that export, takes effect immediately, and does not roll back already-processed rows; call create_log_export and start_log_export again to retry. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `download_log_export` | Get a signed URL for downloading a completed log export. The export must already be finished; use get_log_export to confirm readiness and start_log_export if it has not run yet. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `update_log_export` | Update an existing log export configuration before or between export runs. Only workspace_id, time_of_generation_max, and requested_fields can change after creation, so use get_log_export to review the current job and start_log_export after the definition is ready. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |

## providers (5)

Routes:

- GET/POST `/providers`; GET/PUT/DELETE `/providers/{slug}`

| Tool | Selection guidance and result |
|---|---|
| `list_providers` | List workspace-scoped provider instances and their limits or status. Use this to find provider slugs for workspace-level updates; use list_integrations for the org-level source connection. Returns total plus provider name, slug, integration, status, limits, expiration, and reset flags. |
| `create_provider` | Create a workspace provider backed by an org integration. The provider inherits the integration key, but its limits and expiration are enforced independently for that workspace. Returns the new provider id and slug. |
| `get_provider` | Fetch one provider by slug, including limits, rate settings, expiration, and reset status. Use this to check consumption or audit configuration before updating. |
| `update_provider` | Update a provider's metadata, limits, or expiration. reset_usage clears accumulated usage counters immediately, so use it only when you intend to reset quota tracking. Returns the updated provider id and slug. |
| `delete_provider` | Delete a workspace provider by slug. This is irreversible and will break prompts, configs, and virtual keys that reference it; use delete_integration for the org source instead. Returns success after the provider is removed. |

## secret-references (5)

Routes:

- GET/POST `/secret-references`; GET/PUT/DELETE `/secret-references/{id}`

| Tool | Selection guidance and result |
|---|---|
| `create_secret_reference` | Create a reference to a secret stored in AWS Secrets Manager, Azure Key Vault, or HashiCorp Vault. Authentication credentials are sent to Portkey and exposed to this MCP transcript; use short-lived or workload identity modes when possible. Returns the new UUID and slug, never the resolved external secret. |
| `list_secret_references` | List Secret References without returning authentication configuration or resolved secret values. Filter by manager type, tags, or name and use a returned UUID or slug with get_secret_reference. |
| `get_secret_reference` | Retrieve one Secret Reference by UUID or slug. Portkey masks sensitive authentication fields for non-system users; the tool returns metadata and the masked auth configuration, not the resolved external secret value. |
| `update_secret_reference` | Update at least one selected field on a Secret Reference. auth_config is merged into the existing manager-specific configuration. allowed_workspaces replaces all workspace mappings and sets allow_all_workspaces=false; allow_all_workspaces=true removes workspace-specific mappings. Credential values are sent to Portkey and exposed to the MCP transcript. |
| `delete_secret_reference` | Permanently delete a Secret Reference. This is irreversible and integrations or virtual keys using it can fail to resolve credentials immediately; confirm dependencies before deletion. |

## integrations (11)

Routes:

- GET `https://api.portkey.ai/model-configs/pricing/{provider}/{model}` (public catalog, no Admin API credential)
- GET/POST `/integrations`; GET/PUT/DELETE `/integrations/{slug}`
- GET/PUT/DELETE `/integrations/{slug}/models`; GET/PUT `/integrations/{slug}/workspaces`

| Tool | Selection guidance and result |
|---|---|
| `get_model_pricing` | Get Portkey's current public pricing configuration for one exact provider/model pair. Prices are returned in USD cents per token or provider-specific unit and may include cache, audio, image, fine-tuning, and calculation metadata. Use this read-only catalog lookup before setting integration pricing_adjustments or custom-model pricing; it does not return your negotiated integration multiplier or require Portkey authentication. |
| `list_integrations` | List org-level AI provider connections with optional workspace or type filters. Use this to find integration slugs before model or workspace updates. Returns total plus id, name, slug, provider, status, description, workspace counts, and config summary. |
| `create_integration` | Create an AI-provider integration that becomes the source for workspace providers. ai_provider_id identifies the backend; provider-specific fields configure Azure, Bedrock, Vertex, or custom hosts. For workspace-scoped integrations, create_default_provider controls automatic provider creation. key is write-only, but secret_mappings can resolve it or configuration fields from Secret References at runtime. pricing_adjustments apply negotiated discounts or markups to cost accounting. Use update_integration_models and update_integration_workspaces after creation; returns the new integration id and slug. |
| `get_integration` | Fetch one integration by slug, including masked key, workspace access, allowed models, and configuration metadata. Use this before editing provider-specific settings or auditing access. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `update_integration` | Update an integration's name, description, API key, provider config, Secret Reference mappings, or pricing adjustments by slug. Only provided fields change; key, secret mapping, and config changes take effect immediately and can disrupt dependent providers or live requests, while pricing multipliers change cost analytics and budget accounting. Review get_integration first. Model availability and workspace access remain separate in update_integration_models and update_integration_workspaces. |
| `delete_integration` | Delete an integration by slug. This is irreversible and stops the org-level connection, which will break dependent virtual keys, providers, and workspace access. |
| `list_integration_models` | List models enabled on an integration. Use this to verify model availability before creating prompts or configs. Returns total plus model ids, display names, enabled state, and custom-model markers. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `update_integration_models` | Bulk enable or disable integration models, register custom or fine-tuned models, set per-model hosts and headers, and attach static token pricing. allow_all_models controls whether future provider models start enabled. These changes affect every workspace using the integration; inspect list_integration_models first and use get_model_pricing when deriving custom rates. Returns success and the number of models updated. |
| `delete_integration_model` | Delete a custom model from an integration. Built-in models should be disabled instead, because deletion only applies to custom entries. Returns success after the custom model is removed. |
| `list_integration_workspaces` | List workspaces that can use an integration, with their limits. Use this to audit access or confirm per-workspace cost and rate settings. Returns total plus workspace ids, names, enabled state, usage limits, and rate limits. Enterprise-gated. Returns 403 on non-Enterprise Portkey plans. |
| `update_integration_workspaces` | Control per-workspace and global access to an integration, including cost/rate limits, usage resets, and automatic default-provider creation. global_workspace_access_enabled affects current and future workspaces; override_existing_workspace_access determines whether it replaces explicit workspace settings. Per-workspace default-provider fields override top-level values. Review list_integration_workspaces first because access and limits change downstream usage immediately. |

## mcp-integrations (10)

Routes:

- GET/POST `/mcp-integrations`; GET/PUT/DELETE `/mcp-integrations/{id}`
- GET `/mcp-integrations/{id}/metadata`; GET/PUT `/mcp-integrations/{id}/capabilities`; GET/PUT `/mcp-integrations/{id}/workspaces`

| Tool | Selection guidance and result |
|---|---|
| `list_mcp_integrations` | List MCP integrations in the organization. Returns paginated integration records plus total and has_more for discovering integration IDs; use get_mcp_integration for one integration's full Portkey-side config and list_mcp_servers for the servers under an integration. |
| `create_mcp_integration` | Create a Portkey integration for an external MCP server URL. For headers auth, provide custom_headers or a Secret Reference mapping targeting configurations.custom_headers; secret_mappings resolve protected values at runtime without storing them in the tool call. Organisation admin keys normally need workspace_id. After creation, create_mcp_server and configure capabilities/access; returns the integration id and slug. |
| `get_mcp_integration` | Retrieve one MCP integration by id or slug. Returns the full Portkey-side config, including auth type, transport, and masked configuration keys; use get_mcp_integration_metadata for the server's self-reported metadata. |
| `update_mcp_integration` | Update an MCP integration's name, description, URL, auth, transport, headers, or runtime Secret Reference mappings. Only supplied fields change; URL, auth, header, and secret changes apply immediately and can break active clients, so inspect get_mcp_integration first. Use update_mcp_server when changing only a Portkey server instance's display metadata. |
| `delete_mcp_integration` | Delete an MCP integration and all servers beneath it. This is irreversible, removes connected access immediately, and should only be used after confirming nothing depends on the integration. |
| `get_mcp_integration_metadata` | Retrieve the external MCP server's self-reported metadata for an integration. Returns name, version, protocol, capability flags, and sync status; use get_mcp_integration for the Portkey-side connection config. |
| `list_mcp_integration_capabilities` | List capabilities exposed by the external MCP server for an integration. Returns total plus enabled-state entries so you can decide what to toggle; use before update_mcp_integration_capabilities when you need to compare the current surface. |
| `update_mcp_integration_capabilities` | Bulk enable or disable capabilities (tools, prompts, resources) on an MCP integration. A reversible toggle, not a deletion: only the capabilities named in the array change state, the change hides or exposes them immediately for connected users, and re-running with enabled flipped restores them. Source the integration id from list_mcp_integrations and current capability names, types, and states from list_mcp_integration_capabilities. Returns a success confirmation message. |
| `list_mcp_integration_workspaces` | List which workspaces can access an MCP integration. Returns the global access mode plus per-workspace enablement for audit or permission review; use before update_mcp_integration_workspaces. |
| `update_mcp_integration_workspaces` | Grant or revoke workspace access to an MCP integration in bulk. Reversible: only the workspaces listed change, access applies or is removed immediately for all users in those workspaces, and re-running with enabled flipped undoes a change. Source the integration id from list_mcp_integrations, workspace ids from list_workspaces, and the current access state from list_mcp_integration_workspaces. Returns a success confirmation message. |

## mcp-servers (12)

Routes:

- GET/POST `/mcp-servers`; GET/PUT/DELETE `/mcp-servers/{id}`; POST `/mcp-servers/{id}/test`
- GET/PUT `/mcp-servers/{id}/capabilities`; GET/PUT `/mcp-servers/{id}/user-access`; GET/DELETE `/mcp-servers/{id}/connections`

| Tool | Selection guidance and result |
|---|---|
| `list_mcp_server_connections` | List active connection records for one Portkey-managed MCP server, including user, connected state, and connection timestamps. Use it to audit sessions or identify the user/workspace before disconnect_mcp_server_connection; service keys can list all users, while user keys default to their own user. Organisation admin keys must provide workspace_id. This reads live connection state and does not test upstream server reachability (use test_mcp_server for that). |
| `disconnect_mcp_server_connection` | Disconnect one user's active session from a Portkey-managed MCP server. This immediately ends that connection but does not revoke future access; use update_mcp_server_user_access when access itself should be removed. Provide user_id with service keys (user keys derive it), and workspace_id with organisation admin keys. Inspect list_mcp_server_connections first when the target is uncertain. |
| `list_mcp_servers` | List MCP servers in the organization. Returns paginated server records plus total for discovering server IDs; use get_mcp_server for one server's details and list_mcp_integrations for the parent integration. |
| `create_mcp_server` | Create an MCP server under an existing integration. Registers the server and returns the new id and slug; use list_mcp_integrations first to find the parent integration, then capabilities or access tools to configure it. |
| `get_mcp_server` | Retrieve one MCP server by id or slug. Returns server details including the parent integration, status, and created time; use get_mcp_server when you need the server record rather than the integration config. |
| `update_mcp_server` | Update an MCP server's name or description. Changes apply immediately, but URL and auth live on the parent integration, so use update_mcp_integration for those fields. |
| `delete_mcp_server` | Delete an MCP server instance. This is irreversible, removes connected users' access immediately, and should be used only after confirming no workflows depend on the server. |
| `test_mcp_server` | Test connectivity to an MCP server. Sends a live check and returns success, response time, HTTP status, and any error; use this before changing configuration or when diagnosing reachability. |
| `list_mcp_server_capabilities` | List capabilities exposed by an MCP server instance. Returns total plus the current tool, resource, and prompt surface; use this instead of the integration-level capability list when you need server-specific exposure. |
| `update_mcp_server_capabilities` | Enable or disable capabilities on an MCP server. Changes take effect immediately and override the integration-level settings for this server; use list_mcp_server_capabilities first to inspect the current surface. |
| `list_mcp_server_user_access` | List per-user access for an MCP server. Returns the default access mode, override flags, and connection status so you can audit who can use it; use before update_mcp_server_user_access. |
| `update_mcp_server_user_access` | Grant or revoke individual user access to an MCP server. Changes take effect immediately and override the default access setting for the selected users; use list_mcp_server_user_access first if you need the current state. |
<!-- tool-catalog:end -->

## Current wire-contract notes

- Rate conditions are `{ key, value, excludes? }`; grouping entries are
  `{ key }`. Rate units are `rpm|rph|rpd|rpw`, and targets are
  `llm|mcp_tools`.
- Usage-policy reads include current reset metadata when Portkey returns it:
  `periodic_reset_days`, `next_usage_reset_at`, and `last_reset_at`.
- Workspace membership creation accepts one MCP-facing member but sends Portkey's
  batched `{ users: [{ id, role }] }` wire form.
- Prompt `is_raw_template` semantics are preserved through create, update,
  migration, copy, version reads, and promotion.
- Deployment registration or authentication rotation may return one-time secrets.
  Tool results warn that those values appear in the MCP transcript and must be
  stored immediately. The deprecated deployment ping operation is not exposed.
- Virtual Keys and Providers remain separate current Admin API domains even as
  Portkey product terminology shifts toward Providers.

## Tracked but not exposed

- Prompt and partial share/fork/unshare operations remain out until Portkey
  publishes complete public contracts and an unambiguous versioned base path.
- Agent Gateway management remains out until its public management contract is
  merged and stable.
- SDK-only MCP integration sync, credential, metadata, client-info, and access-check
  operations remain out unless they gain public contracts and transcript-safe
  credential handling.
- MCP integration test/authorization-parameter additions and guardrail `ids`
  filtering remain tracked because they are absent from the current public OpenAPI.
- Prisma AIRS remains a separate interoperability surface, not a
  `PORTKEY_BASE_URL` replacement.
