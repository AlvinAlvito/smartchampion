import type { MetadataRoute } from "next";
import { SITE_META_DESCRIPTION, SITE_NAME } from "@/lib/seo";

/** Web app manifest (ikon di layar utama HP & identitas situs) */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Champion Online Class`,
    short_name: SITE_NAME,
    description: SITE_META_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#f2f7fb",
    theme_color: "#0f2436",
    lang: "id",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
