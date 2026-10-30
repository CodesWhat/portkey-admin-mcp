import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Portkey Admin MCP",
    short_name: "Portkey Admin MCP",
    start_url: "/",
    display: "browser",
    background_color: "#16101e",
    theme_color: "#16101e",
    icons: [
      { src: "/assets/portkey-192.webp", sizes: "192x192", type: "image/webp" },
    ],
  };
}
