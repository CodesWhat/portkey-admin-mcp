import posthog from "posthog-js/dist/module.slim";

import {
  type AnalyticsEvent,
  buildCtaEvent,
  buildPageviewEvent,
  buildWebVitalsEvent,
  type CtaId,
  type CtaPlacement,
  canonicalizeAnalyticsRoute,
  createPostHogOptions,
  isProductionHostname,
} from "./contract";
import { createWebVitalsReporter as createBufferedWebVitalsReporter } from "./web-vitals-buffer";

let initialized = false;

export function initializeAnalytics(
  projectToken: string | undefined,
  proxyHost: string | undefined,
  uiHost: string | undefined,
): void {
  if (initialized || typeof window === "undefined") return;
  if (!isProductionHostname(window.location.hostname)) return;
  const options = createPostHogOptions(projectToken, proxyHost, uiHost);
  if (!options || !projectToken) return;
  posthog.init(projectToken, options);
  initialized = true;
}

function capture(event: AnalyticsEvent | null): void {
  if (!initialized || !event) return;
  posthog.capture(event.event, event.properties);
}

export function capturePageview(path: string): void {
  capture(buildPageviewEvent(path));
}

export function createWebVitalsReporter(path: string): (name: string, value: number) => void {
  const reporter = createBufferedWebVitalsReporter(
    path,
    capture,
    buildWebVitalsEvent,
    canonicalizeAnalyticsRoute,
  );
  return reporter.record;
}

export function captureCta(path: string, ctaId: CtaId, placement: CtaPlacement): void {
  capture(buildCtaEvent(path, ctaId, placement));
}
