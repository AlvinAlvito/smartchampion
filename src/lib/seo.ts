import type { Metadata } from "next";

/** Pengaturan SEO bersama (metadata, sitemap, robots, data terstruktur JSON-LD). */

export const SITE_URL = (process.env.APP_URL || "https://pelatihan.posi.my.id").replace(/\/+$/, "");
export const SITE_NAME = "Pelatihan POSI";

export const SITE_TITLE = "Pelatihan Olimpiade Online SD, SMP, SMA | Pelatihan POSI";
export const SITE_DESCRIPTION =
  "Champion Online Class (COC) POSI: pelatihan olimpiade online untuk SD, SMP, dan SMA bersama tutor medalis. Persiapan OSN, KSN, dan kompetisi sains — Matematika, IPA, Fisika, Bahasa Inggris, dan lainnya. Ada kelas VIP privat 1-on-1, games edukasi gratis, dan pembayaran aman via Midtrans.";

/** Versi ringkas (≤ 160 karakter) untuk meta description */
export const SITE_META_DESCRIPTION =
  "Pelatihan olimpiade online SD, SMP, SMA bersama tutor medalis: persiapan OSN & KSN Matematika, IPA, Fisika, dll. Kelas grup COC & VIP privat 1-on-1.";

export const SITE_KEYWORDS = [
  "pelatihan olimpiade",
  "pelatihan olimpiade online",
  "bimbel olimpiade",
  "les olimpiade",
  "kelas olimpiade online",
  "persiapan OSN",
  "persiapan KSN",
  "olimpiade matematika",
  "olimpiade IPA",
  "olimpiade sains SD",
  "olimpiade SMP",
  "olimpiade SMA",
  "Champion Online Class",
  "COC POSI",
  "POSI",
  "Mimpi.mu",
  "les privat olimpiade",
];

export const abs = (path = "/") => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

/** Metadata untuk halaman yang tidak boleh muncul di Google (login, pembayaran, panel, dll.) */
export const NOINDEX = { robots: { index: false, follow: false, googleBot: { index: false, follow: false } } } as const;

export const organizationLd = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  alternateName: ["POSI", "Champion Online Class"],
  url: SITE_URL,
  logo: abs("/icon"),
  description: SITE_DESCRIPTION,
  areaServed: { "@type": "Country", name: "Indonesia" },
  sameAs: ["https://posi.id"],
};

export const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: "id-ID",
  publisher: { "@id": `${SITE_URL}/#organization` },
  // kotak pencarian situs di hasil Google → katalog kelas
  potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/kelas?q={search_term_string}` }, "query-input": "required name=search_term_string" },
};

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.path) })),
  };
}

/** Potong teks rapi untuk meta description (≤ 160 karakter) */
export function clip(text: string, max = 158) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/**
 * Metadata lengkap satu halaman publik: judul, deskripsi, canonical, Open Graph & kartu X.
 * (openGraph di halaman menggantikan milik layout seluruhnya, jadi selalu ditulis lengkap di sini.)
 */
const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "Pelatihan POSI — pelatihan olimpiade online SD, SMP, SMA" };

export function pageMeta({ title, description, path, absoluteTitle = false }: { title: string; description: string; path: string; absoluteTitle?: boolean }): Metadata {
  const full = absoluteTitle ? title : `${title} · ${SITE_NAME}`;
  const desc = clip(description);
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description: desc,
    alternates: { canonical: path },
    // gambar share ditulis eksplisit: openGraph halaman menggantikan milik layout (termasuk opengraph-image)
    openGraph: { type: "website", locale: "id_ID", siteName: SITE_NAME, url: path, title: full, description: desc, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: full, description: desc, images: [OG_IMAGE.url] },
  };
}
