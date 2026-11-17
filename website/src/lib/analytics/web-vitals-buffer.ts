import type { AnalyticsEvent, WebVitalName } from "./contract";

const WEB_VITAL_NAMES = new Set<WebVitalName>(["CLS", "FCP", "INP", "LCP"]);

type BuildEvent = (
  path: string,
  metrics: Readonly<Partial<Record<WebVitalName, number>>>,
) => AnalyticsEvent | null;
type CanonicalizePath = (path: string) => {
  normalizedPath: string;
  path: string;
  surface: string;
};

// Next reports without reportAllChanges, so CLS and INP finalize when the page
// goes hidden. Metrics are buffered and sent once all four are in, or on the
// caller's lifecycle flush (visibility hidden / pagehide). A metric is never
// sent twice; one that arrives after a flush goes out in the next envelope.
export function createWebVitalsReporter(
  initialPath: string,
  emit: (event: AnalyticsEvent) => void,
  buildEvent: BuildEvent,
  canonicalizePath: CanonicalizePath,
) {
  const path = canonicalizePath(initialPath).normalizedPath;
  const pending: Partial<Record<WebVitalName, number>> = {};
  const sent = new Set<WebVitalName>();

  const flush = (): void => {
    if (Object.keys(pending).length === 0) return;
    const event = buildEvent(path, pending);
    for (const name of Object.keys(pending) as WebVitalName[]) {
      sent.add(name);
      delete pending[name];
    }
    if (event) emit(event);
  };

  return {
    flush,
    record(name: string, value: number): void {
      if (!WEB_VITAL_NAMES.has(name as WebVitalName)) return;
      if (!Number.isFinite(value) || value < 0) return;
      const metric = name as WebVitalName;
      if (sent.has(metric)) return;

      pending[metric] = value;
      if (sent.size + Object.keys(pending).length === WEB_VITAL_NAMES.size) flush();
    },
  };
}
