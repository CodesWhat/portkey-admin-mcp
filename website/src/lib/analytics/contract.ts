import type { BeforeSendFn, CaptureResult } from "posthog-js";
import { productId, routesFor } from "../routes.mjs";

export const POSTHOG_PROXY_HOST = "https://e.codeswhat.com";
export const POSTHOG_UI_HOST = "https://us.posthog.com";
export const PRODUCTION_HOSTNAME = "portkey.codeswhat.com";

const SCHEMA_VERSION = 1;
const SITE = productId;
const PROJECT_TOKEN_PATTERN = /^phc_[A-Za-z0-9_-]+$/u;
const COOKIELESS_DISTINCT_ID = "$posthog_cookieless";
const OTHER_PATH = "/_other";

// The site's own route list, normalized to the no-trailing-slash form the
// canonicalizer produces ("/docs/" -> "/docs").
const KNOWN_PATHS: ReadonlySet<string> = new Set(
  routesFor().map((parts: string[]) => (parts.length === 0 ? "/" : `/${parts.join("/")}`)),
);

export type Surface = "marketing" | "docs";
export type WebVitalName = "CLS" | "FCP" | "INP" | "LCP";
export type CtaId =
  | "install_copy"
  | "install_cursor"
  | "docs_root"
  | "github_repository"
  | "npm_package";
export type CtaPlacement = "header" | "hero" | "install" | "footer" | "trust";

type EventProperties = Record<string, unknown>;

export type AnalyticsEvent = {
  event: "$pageview" | "$pageleave" | "$web_vitals" | "cta activated";
  properties: EventProperties;
};

export type PostHogOptions = {
  api_host: typeof POSTHOG_PROXY_HOST;
  ui_host: typeof POSTHOG_UI_HOST;
  autocapture: false;
  rageclick: false;
  capture_pageview: false;
  capture_pageleave: true;
  capture_heatmaps: false;
  capture_dead_clicks: false;
  capture_exceptions: false;
  disable_session_recording: true;
  disable_surveys: true;
  disable_surveys_automatic_display: true;
  disable_product_tours: true;
  disable_web_experiments: true;
  advanced_disable_flags: true;
  cookieless_mode: "always";
  person_profiles: "never";
  persistence: "memory";
  disable_persistence: true;
  respect_dnt: true;
  save_campaign_params: false;
  save_referrer: true;
  disable_capture_url_hashes: true;
  disable_scroll_properties: true;
  mask_all_element_attributes: true;
  mask_all_text: true;
  capture_performance: false;
  before_send: BeforeSendFn;
};

// Every id:placement pair a real component emits. Anything else is dropped.
const CTA_COMBINATIONS = new Set<string>([
  "install_copy:hero",
  "install_copy:install",
  "install_cursor:install",
  "docs_root:header",
  "docs_root:footer",
  "github_repository:header",
  "github_repository:hero",
  "github_repository:footer",
  "npm_package:trust",
]);

const WEB_VITAL_KEYS = [
  "$web_vitals_CLS_value",
  "$web_vitals_FCP_value",
  "$web_vitals_INP_value",
  "$web_vitals_LCP_value",
] as const;

const WEB_VITAL_NAMES: readonly WebVitalName[] = ["CLS", "FCP", "INP", "LCP"];

function normalizedPath(rawPath: string): string {
  const withoutQuery = rawPath.split(/[?#]/u, 1)[0] ?? "";
  if (!withoutQuery.startsWith("/") || withoutQuery.startsWith("//")) return OTHER_PATH;
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.replace(/\/+$/u, "") || "/";
  }
  return withoutQuery;
}

export function canonicalizeAnalyticsRoute(rawPath: string): {
  normalizedPath: string;
  path: string;
  surface: Surface;
} {
  const normalized = normalizedPath(rawPath);
  const surface: Surface =
    normalized === "/docs" || normalized.startsWith("/docs/") ? "docs" : "marketing";
  return {
    normalizedPath: normalized,
    path: KNOWN_PATHS.has(normalized) ? normalized : OTHER_PATH,
    surface,
  };
}

function baseProperties(rawPath: string) {
  const { path, surface } = canonicalizeAnalyticsRoute(rawPath);
  return {
    schema_version: SCHEMA_VERSION,
    site: SITE,
    surface,
    path,
  } as const;
}

// PostHog's Web analytics tables key off $pathname. It mirrors the already
// canonicalized path, so it carries nothing the event was not sending.
function navigationProperties(rawPath: string) {
  const base = baseProperties(rawPath);
  return { ...base, $pathname: base.path } as const;
}

export function buildPageviewEvent(rawPath: string): AnalyticsEvent {
  return { event: "$pageview", properties: navigationProperties(rawPath) };
}

// posthog-js emits $pageleave itself once capture_pageleave is true.
export function buildPageleaveEvent(rawPath: string): AnalyticsEvent {
  return { event: "$pageleave", properties: navigationProperties(rawPath) };
}

export function isAllowedCta(ctaId: unknown, placement: unknown): boolean {
  return (
    typeof ctaId === "string" &&
    typeof placement === "string" &&
    CTA_COMBINATIONS.has(`${ctaId}:${placement}`)
  );
}

export function buildCtaEvent(
  rawPath: string,
  ctaId: CtaId,
  placement: CtaPlacement,
): AnalyticsEvent | null {
  if (!isAllowedCta(ctaId, placement)) return null;
  return {
    event: "cta activated",
    properties: { ...baseProperties(rawPath), cta_id: ctaId, placement },
  };
}

export function buildWebVitalsEvent(
  rawPath: string,
  metrics: Readonly<Partial<Record<WebVitalName, number>>>,
): AnalyticsEvent | null {
  const properties: EventProperties = baseProperties(rawPath);
  let metricCount = 0;
  for (const name of WEB_VITAL_NAMES) {
    const value = metrics[name];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      properties[`$web_vitals_${name}_value`] = value;
      metricCount += 1;
    }
  }
  return metricCount === 0 ? null : { event: "$web_vitals", properties };
}

// $referring_domain is either the "$direct" sentinel or `new URL(referrer).host`,
// so a bare hostname with an optional port is the only legitimate shape.
// Anything else is dropped rather than trimmed.
const HOSTNAME_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/iu;
const DIRECT_REFERRING_DOMAIN = "$direct";
const MAX_HOSTNAME_LENGTH = 253;

function isAcceptableReferringDomain(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value === DIRECT_REFERRING_DOMAIN ||
      (value.length <= MAX_HOSTNAME_LENGTH && HOSTNAME_PATTERN.test(value)))
  );
}

// Referrer hostname only. Campaign parameters (UTM, click ids) are not
// collected: save_campaign_params is off and nothing here copies them.
function acquisitionProperties(properties: EventProperties): EventProperties {
  return isAcceptableReferringDomain(properties.$referring_domain)
    ? { $referring_domain: properties.$referring_domain }
    : {};
}

function rawPathFromProperties(properties: EventProperties): string | undefined {
  if (typeof properties.path === "string") return properties.path;
  if (typeof properties.$current_url !== "string") return undefined;
  try {
    return new URL(properties.$current_url).pathname;
  } catch {
    return undefined;
  }
}

type PrivacySignalScope = {
  doNotTrack?: unknown;
  navigator?: {
    doNotTrack?: unknown;
    globalPrivacyControl?: unknown;
    msDoNotTrack?: unknown;
  };
};

// posthog-js 1.449.2 treats cookieless_mode "always" as capturing before it
// checks DNT, so respect_dnt alone does nothing. Check the browser signals
// ourselves, at call time, so a mid-session opt-in is honored too.
export function hasPrivacySignal(
  scope: PrivacySignalScope | undefined = typeof window === "undefined" ? undefined : window,
): boolean {
  if (!scope) return false;
  return (
    scope.navigator?.doNotTrack === "1" ||
    scope.doNotTrack === "1" ||
    scope.navigator?.msDoNotTrack === "1" ||
    scope.navigator?.globalPrivacyControl === true
  );
}

export const sanitizeEvent: BeforeSendFn = (envelope): CaptureResult | null => {
  if (hasPrivacySignal()) return null;
  if (!envelope || typeof envelope.event !== "string" || !envelope.properties) return null;
  const rawPath = rawPathFromProperties(envelope.properties);
  const token = envelope.properties.token;
  // PostHog's cookieless server-hash step reads $raw_user_agent and $host off
  // event.properties and silently drops the event if either is absent, so both
  // must survive the rebuild. $ip is never forwarded: PostHog fills it in from
  // the request's own connection.
  const rawUserAgent = envelope.properties.$raw_user_agent;
  const host = envelope.properties.$host;
  if (
    typeof rawPath !== "string" ||
    typeof token !== "string" ||
    !PROJECT_TOKEN_PATTERN.test(token) ||
    envelope.properties.$cookieless_mode !== true ||
    envelope.properties.$process_person_profile !== false ||
    typeof rawUserAgent !== "string" ||
    rawUserAgent === "" ||
    typeof host !== "string" ||
    !isProductionHostname(host.replace(/:\d{1,5}$/u, ""))
  ) {
    return null;
  }

  let sanitized: AnalyticsEvent | null;
  if (envelope.event === "$pageview") {
    sanitized = buildPageviewEvent(rawPath);
  } else if (envelope.event === "$pageleave") {
    sanitized = buildPageleaveEvent(rawPath);
  } else if (envelope.event === "cta activated") {
    const ctaId = envelope.properties.cta_id;
    const placement = envelope.properties.placement;
    if (typeof ctaId !== "string" || typeof placement !== "string") return null;
    sanitized = buildCtaEvent(rawPath, ctaId as CtaId, placement as CtaPlacement);
  } else if (envelope.event === "$web_vitals") {
    const metrics: Partial<Record<WebVitalName, number>> = {};
    for (const [index, key] of WEB_VITAL_KEYS.entries()) {
      const value = envelope.properties[key];
      if (typeof value === "number") {
        metrics[WEB_VITAL_NAMES[index]] = value;
      }
    }
    sanitized = buildWebVitalsEvent(rawPath, metrics);
  } else {
    return null;
  }

  if (!sanitized) return null;
  // An unknown route is already collapsed to OTHER_PATH by the builder that
  // produced this envelope, so the raw path can't say which surface it was on.
  // Keep the incoming surface, but only one of the two known values.
  const incomingSurface = envelope.properties.surface;
  if (
    sanitized.properties.path === OTHER_PATH &&
    normalizedPath(rawPath) === OTHER_PATH &&
    (incomingSurface === "docs" || incomingSurface === "marketing")
  ) {
    sanitized.properties.surface = incomingSurface;
  }
  // A fresh envelope: $set, $set_once ($initial_referrer is a full URL) and
  // every other key are left behind by construction.
  const output: CaptureResult = {
    event: sanitized.event,
    properties: {
      ...sanitized.properties,
      ...acquisitionProperties(envelope.properties),
      token,
      $cookieless_mode: true,
      $process_person_profile: false,
      $raw_user_agent: rawUserAgent,
      $host: host,
    },
    uuid: envelope.uuid,
  };
  if (envelope.properties.distinct_id === COOKIELESS_DISTINCT_ID) {
    output.properties.distinct_id = COOKIELESS_DISTINCT_ID;
  }
  if (envelope.timestamp instanceof Date && Number.isFinite(envelope.timestamp.getTime())) {
    output.timestamp = envelope.timestamp;
  }
  return output;
};

// Analytics only runs on the production hostname, so dev servers, previews,
// CI browser checks and local exports never send events.
export function isProductionHostname(hostname: string | undefined): boolean {
  return hostname === PRODUCTION_HOSTNAME;
}

export function createPostHogOptions(
  projectToken: string | undefined,
  proxyHost: string | undefined,
  uiHost: string | undefined,
): PostHogOptions | null {
  if (
    !projectToken ||
    !PROJECT_TOKEN_PATTERN.test(projectToken) ||
    proxyHost !== POSTHOG_PROXY_HOST ||
    uiHost !== POSTHOG_UI_HOST
  ) {
    return null;
  }
  return {
    api_host: POSTHOG_PROXY_HOST,
    ui_host: POSTHOG_UI_HOST,
    autocapture: false,
    rageclick: false,
    capture_pageview: false,
    capture_pageleave: true,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_surveys_automatic_display: true,
    disable_product_tours: true,
    disable_web_experiments: true,
    advanced_disable_flags: true,
    cookieless_mode: "always",
    person_profiles: "never",
    persistence: "memory",
    disable_persistence: true,
    respect_dnt: true,
    save_campaign_params: false,
    save_referrer: true,
    disable_capture_url_hashes: true,
    disable_scroll_properties: true,
    mask_all_element_attributes: true,
    mask_all_text: true,
    capture_performance: false,
    before_send: sanitizeEvent,
  };
}
