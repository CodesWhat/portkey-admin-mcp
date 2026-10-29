import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Provider } from "@/components/controls";
import { siteUrl } from "@/lib/routes.mjs";
import "./styles.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  icons: {
    icon: [{ url: "/assets/portkey-64.webp", type: "image/webp" }],
    apple: [{ url: "/assets/portkey-192.webp", sizes: "192x192" }],
  },
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f5fc" },
    { media: "(prefers-color-scheme: dark)", color: "#16101e" },
  ],
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
