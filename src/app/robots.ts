import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** /robots.txt — halaman publik boleh dirayapi; panel, akun, pembayaran & API tidak. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/dashboard", "/api/", "/pembayaran/", "/kelas/*/daftar", "/login", "/register"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
