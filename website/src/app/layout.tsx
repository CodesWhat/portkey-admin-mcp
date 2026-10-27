import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Provider } from "@/components/controls";
import { siteUrl } from "@/lib/routes.mjs";
import "./styles.css";

export const metadata: Metadata = { metadataBase: new URL(siteUrl) };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
