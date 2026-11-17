import { initializeAnalytics } from "@/lib/analytics/client";

initializeAnalytics(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
  process.env.NEXT_PUBLIC_POSTHOG_HOST,
  process.env.NEXT_PUBLIC_POSTHOG_UI_HOST,
);
