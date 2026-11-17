"use client";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useCallback, useEffect, useRef } from "react";
import {
  captureCta,
  capturePageview,
  createWebVitalsReporter,
} from "@/lib/analytics/client";
import type { CtaId, CtaPlacement } from "@/lib/analytics/contract";

export function AnalyticsRuntime() {
  const pathname = usePathname();
  const webVitalsReporter = useRef<ReturnType<typeof createWebVitalsReporter> | null>(null);
  if (webVitalsReporter.current === null) {
    webVitalsReporter.current = createWebVitalsReporter(pathname);
  }

  // Runs on mount (first load) and on every client-side route change, once each.
  useEffect(() => {
    capturePageview(pathname);
  }, [pathname]);

  // CTAs are marked up as data-cta="<id>:<placement>" on the element itself, so
  // server-rendered links need no client wrapper. Unknown pairs are dropped in
  // the contract, not here.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const [id, placement] = (event.target.closest("[data-cta]")?.getAttribute("data-cta") ?? "").split(":");
      if (id && placement) captureCta(pathname, id as CtaId, placement as CtaPlacement);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [pathname]);

  const reportWebVital = useCallback<Parameters<typeof useReportWebVitals>[0]>(
    ({ name, value }) => {
      webVitalsReporter.current?.(name, value);
    },
    [],
  );
  useReportWebVitals(reportWebVital);

  return null;
}
