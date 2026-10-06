import { ImageResponse } from "next/og";
import { BrandMark, brandImage } from "./brand-mark";

export const alt = "Pelatihan POSI — pelatihan olimpiade online SD, SMP, SMA";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Gambar pratinjau saat link dibagikan (WhatsApp, Facebook, X, dll.) */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        color: "white",
        background:
          "radial-gradient(55% 75% at 88% 8%, rgba(249,208,20,0.35) 0%, transparent 60%), linear-gradient(135deg, #0b2638 0%, #14577d 50%, #1a6f9f 100%)",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <BrandMark size={96} />
        <div style={{ display: "flex", fontSize: 44, fontWeight: 800 }}>
          Pelatihan <span style={{ color: "#ffe56a", marginLeft: 12 }}>POSI</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.08, maxWidth: 640 }}>Pelatihan Olimpiade Online SD, SMP, SMA</div>
        <div style={{ fontSize: 28, color: "#d8eef9", maxWidth: 640 }}>Bersama tutor medalis · persiapan OSN & KSN</div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={brandImage("smarty")} width={205} height={240} alt="" style={{ position: "absolute", right: 235, bottom: 56 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={brandImage("champy")} width={226} height={260} alt="" style={{ position: "absolute", right: 36, bottom: 56 }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 24, maxWidth: 680 }}>
        {["Kelas grup COC", "VIP Privat 1-on-1", "Games edukasi"].map((t) => (
          <div
            key={t}
            style={{
              display: "flex",
              padding: "10px 22px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,229,106,0.45)",
            }}
          >
            {t}
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
