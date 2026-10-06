/** Data terstruktur schema.org untuk Google. `<` di-escape agar isi data tidak bisa menutup tag script. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
