import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SR-CScanner",
    short_name: "SR Scan",
    description: "Private on-device document scanner from Sunrise Recruit.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3efe7",
    theme_color: "#1c1915",
    lang: "en",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
