export function LowerSections() {
  return (
    <>
      <section id="safety" aria-labelledby="safety-h" className="home-section wrap">
        <div className="split">
          <div className="sec-h">
            <div className="eyebrow">Safety</div>
            <h2 className="section-title" id="safety-h">
              It acts with your key's scopes.
            </h2>
          </div>
          <div className="section-body">
            <ul className="srows">
              <li>
                <b>Writes are real.</b> The server does whatever your key allows. 96 of the 194
                tools write, and 38 carry a destructive hint, so a client that honours it can ask
                first.
              </li>
              <li>
                <b>Narrow it.</b> Use a least-privilege key, restrict the domains with{" "}
                <code>PORTKEY_TOOL_DOMAINS</code>, and rotate the key if it leaks. Treat text that
                comes back from your workspace as untrusted input.
              </li>
              <li>
                <b>Check before you retry.</b> <code>run_prompt_completion</code> makes a billable
                call; <code>render_prompt</code> and <code>validate_completion_metadata</code> do
                not. After a dropped request, inspect with a <code>get_*</code> or{" "}
                <code>list_*</code> tool before repeating a write.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section id="trust" aria-labelledby="trust-h" className="home-section wrap">
        <div className="split">
          <div className="sec-h">
            <div className="eyebrow">Trust</div>
            <h2 className="section-title" id="trust-h">
              Open source, with provenance.
            </h2>
          </div>
          <div className="section-body">
            <ul className="trust">
              <li>
                <a href="https://opensource.org/licenses/MIT">
                  <img
                    src="/assets/badges/mit.svg"
                    alt="License: MIT"
                    width="82"
                    height="20"
                    loading="lazy"
                    decoding="async"
                  />
                </a>
              </li>
              <li>
                <a href="https://www.npmjs.com/package/portkey-admin-mcp">
                  <img
                    src="https://img.shields.io/npm/v/portkey-admin-mcp.svg"
                    alt="npm version badge"
                    width="88"
                    height="20"
                    loading="lazy"
                    decoding="async"
                  />
                </a>
                <a href="/docs/verify-release/">Verify a release</a>
              </li>
              <li>
                <a href="https://glama.ai/mcp/servers/CodesWhat/portkey-admin-mcp">
                  <img
                    src="/assets/badges/glama-score.svg"
                    alt="Glama listing score badge"
                    width="110"
                    height="20"
                    loading="lazy"
                    decoding="async"
                  />
                </a>
              </li>
              <li>
                <a href="https://securityscorecards.dev/viewer/?uri=github.com/CodesWhat/portkey-admin-mcp">
                  <img
                    src="/assets/badges/openssf-scorecard.svg"
                    alt="OpenSSF Scorecard badge"
                    width="136"
                    height="20"
                    loading="lazy"
                    decoding="async"
                  />
                </a>
              </li>
              <li>
                <a href="https://github.com/CodesWhat/portkey-admin-mcp/actions/workflows/ci.yml">
                  <img
                    src="/assets/badges/ci.svg"
                    alt="CI workflow badge"
                    width="90"
                    height="20"
                    loading="lazy"
                    decoding="async"
                  />
                </a>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section id="prompts" aria-labelledby="prompts-h" className="home-section wrap">
        <div className="split">
          <div className="sec-h">
            <div className="eyebrow">Example prompts</div>
            <h2 className="section-title" id="prompts-h">
              Try asking your client.
            </h2>
          </div>
          <div className="section-body">
            <ol className="prompts">
              <li>
                <p className="pq">“List my prompts and tell me which model each one uses.”</p>
                <p className="pt">
                  <code>list_prompts</code>
                  <span className="fl f-read">Read</span> <code>get_prompt</code>
                  <span className="fl f-read">Read</span>
                </p>
              </li>
              <li>
                <p className="pq">
                  “Check this metadata for the support-bot prompt in staging before I run it.”
                </p>
                <p className="pt">
                  <code>validate_completion_metadata</code>
                  <span className="fl f-read">Read</span> <code>run_prompt_completion</code>
                  <span className="fl f-write">Write</span>
                </p>
              </li>
              <li>
                <p className="pq">“Promote the latest support-triage version to production.”</p>
                <p className="pt">
                  <code>list_prompt_versions</code>
                  <span className="fl f-read">Read</span> <code>promote_prompt</code>
                  <span className="fl f-write">Write</span>
                </p>
              </li>
              <li>
                <p className="pq">
                  “Rotate the staging API key and tell me which key replaced it.”
                </p>
                <p className="pt">
                  <code>list_api_keys</code>
                  <span className="fl f-read">Read</span> <code>rotate_api_key</code>
                  <span className="fl f-destructive">Destructive</span>
                </p>
              </li>
              <li>
                <p className="pq">“What did we spend by model last week?”</p>
                <p className="pt">
                  <code>get_cost_analytics</code>
                  <span className="fl f-read">Read</span> <code>get_analytics_group_models</code>
                  <span className="fl f-read">Read</span>{" "}
                  <span className="chip t-warning">Enterprise</span>
                </p>
              </li>
              <li>
                <p className="pq">“Show me last week's errors grouped by status code.”</p>
                <p className="pt">
                  <code>get_error_status_codes_analytics</code>
                  <span className="fl f-read">Read</span>{" "}
                  <span className="chip t-warning">Enterprise</span>
                </p>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section id="faq" aria-labelledby="faq-h" className="home-section wrap">
        <div className="split">
          <div className="sec-h">
            <div className="eyebrow">FAQ and docs</div>
            <h2 className="section-title" id="faq-h">
              Quick answers.
            </h2>
          </div>
          <div className="section-body">
            <div className="faq">
              <details className="fq" name="faq">
                <summary>
                  <span className="q">Which key do I need?</span>
                  <span className="pm" aria-hidden="true"></span>
                </summary>
                <div className="a">
                  <p>
                    Most tools work with a workspace-scoped service key that has Select All
                    permissions. Create it in the Portkey dashboard under API Keys. Prompt
                    completions also need <code>completions.write</code> and billing metadata.
                  </p>
                </div>
              </details>
              <details className="fq" name="faq">
                <summary>
                  <span className="q">Why do I get a 403 with AB03?</span>
                  <span className="pm" aria-hidden="true"></span>
                </summary>
                <div className="a">
                  <p>
                    That Portkey error means the key is missing scopes. It does not mean the
                    endpoint is broken. Add the scope the tool needs, or use a key that has it.
                  </p>
                </div>
              </details>
              <details className="fq" name="faq">
                <summary>
                  <span className="q">Do I need an Enterprise plan?</span>
                  <span className="pm" aria-hidden="true"></span>
                </summary>
                <div className="a">
                  <p>
                    Only for the 56 Enterprise-gated tools: organisation-level analytics,
                    deployments, audit logs, organisation guardrails, log exports and SCIM.
                    Everything else works on a workspace key. The tool list above marks them.
                  </p>
                </div>
              </details>
              <details className="fq" name="faq">
                <summary>
                  <span className="q">How do I expose fewer tools?</span>
                  <span className="pm" aria-hidden="true"></span>
                </summary>
                <div className="a">
                  <p>
                    Set <code>PORTKEY_TOOL_DOMAINS</code> to a comma-separated list of domains, for
                    example <code>prompts,analytics</code>. It narrows what your client sees and
                    does not grant or remove API permissions.
                  </p>
                </div>
              </details>
              <details className="fq" name="faq">
                <summary>
                  <span className="q">Where does it run?</span>
                  <span className="pm" aria-hidden="true"></span>
                </summary>
                <div className="a">
                  <p>
                    There is no hosted version. The server runs locally over stdio. An HTTP
                    transport exists, but it is experimental and self-hosted, and a Vercel
                    deployment guide is kept as a reference.
                  </p>
                </div>
              </details>
              <details className="fq" name="faq">
                <summary>
                  <span className="q">Which Node version?</span>
                  <span className="pm" aria-hidden="true"></span>
                </summary>
                <div className="a">
                  <p>Node 24 or later.</p>
                </div>
              </details>
            </div>
            <ul className="dlinks" aria-label="Documentation">
              <li>
                <a href="/docs/compatibility/">Compatibility and deprecations →</a>
              </li>
              <li>
                <a href="/docs/manual/">Install and configure ↗</a>
              </li>
              <li>
                <a href="/docs/tools/">Tool reference ↗</a>
              </li>
              <li>
                <a href="/docs/security/">Security assurance ↗</a>
              </li>
              <li>
                <a href="/docs/verify-release/">Verify a release ↗</a>
              </li>
              <li>
                <a href="/docs/prisma-airs/">Prisma AIRS interoperability ↗</a>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
