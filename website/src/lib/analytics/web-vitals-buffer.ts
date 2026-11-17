import type { AnalyticsEvent, WebVitalName } from "./contract";

export const WEB_VITALS_FLUSH_DELAY_MS = 5_000;

const WEB_VITAL_NAMES = new Set<WebVitalName>(["CLS", "FCP", "INP", "LCP"]);

type Schedule = (callback: () => void, delayMs: number) => unknown;
type Cancel = (timer: unknown) => void;
type BuildEvent = (
  path: string,
  metrics: Readonly<Partial<Record<WebVitalName, number>>>,
) => AnalyticsEvent | null;
type CanonicalizePath = (path: string) => {
  normalizedPath: string;
  path: string;
  surface: string;
};

const defaultSchedule: Schedule = (callback, delayMs) => setTimeout(callback, delayMs);
const defaultCancel: Cancel = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>);

export function createWebVitalsReporter(
  initialPath: string,
  emit: (event: AnalyticsEvent) => void,
  buildEvent: BuildEvent,
  canonicalizePath: CanonicalizePath,
  schedule: Schedule = defaultSchedule,
  cancel: Cancel = defaultCancel,
) {
  const path = canonicalizePath(initialPath).normalizedPath;
  const metrics: Partial<Record<WebVitalName, number>> = {};
  let timer: unknown;
  let sent = false;

  const flush = () => {
    if (sent) return;
    sent = true;
    if (timer !== undefined) {
      cancel(timer);
      timer = undefined;
    }
    const event = buildEvent(path, metrics);
    if (event) emit(event);
  };

  return {
    record(name: string, value: number): void {
      if (sent || !WEB_VITAL_NAMES.has(name as WebVitalName)) return;
      if (!Number.isFinite(value) || value < 0) return;

      metrics[name as WebVitalName] = value;
      if (timer === undefined) {
        timer = schedule(flush, WEB_VITALS_FLUSH_DELAY_MS);
      }
      if (WEB_VITAL_NAMES.size === Object.keys(metrics).length) flush();
    },
  };
}
