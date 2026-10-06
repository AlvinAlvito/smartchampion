import fs from "node:fs";
import path from "node:path";

/** Gambar brand (PNG) sebagai data URL untuk next/og (ikon & gambar share dibuat saat build). */
export function brandImage(name: "sc" | "smarty" | "champy") {
  const buf = fs.readFileSync(path.join(process.cwd(), "assets", "brand", `${name}.png`));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

/** Logo bintang Smart Champion di kotak putih membulat, untuk ikon & gambar share. */
export function BrandMark({ size }: { size: number }) {
  const s = size * 0.78;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        background: "linear-gradient(135deg, #ffffff 0%, #fffbe6 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={brandImage("sc")} width={s * 0.92} height={s} alt="" />
    </div>
  );
}
