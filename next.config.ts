import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tombol indikator dev ("N") menutupi navbar bawah di layar HP; error tetap ditampilkan.
  devIndicators: false,
  // jangan umumkan teknologi server
  poweredByHeader: false,
  // Header keamanan untuk semua halaman (dipilih agar tidak mengganggu Midtrans Snap & embed video)
  async headers() {
    const csp = [
      "frame-ancestors 'self'", // anti clickjacking
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), usb=(), interest-cohort=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
    ];
  },
  // Build mandiri (server.js + node_modules minimal) untuk deploy ke VPS
  output: "standalone",
  // Renderer PDF laporan performa dijalankan apa adanya dari node_modules (tidak dibundel)
  serverExternalPackages: ["@react-pdf/renderer"],
  // Font laporan PDF ikut disalin ke build standalone
  outputFileTracingIncludes: {
    "/api/admin/performa/pdf": ["./assets/fonts/**/*"],
    "/api/sertifikat/**": ["./assets/fonts/**/*", "./assets/certificate/**/*"],
    "/api/rapor/**": ["./assets/fonts/**/*", "./assets/report/**/*"],
    "/api/admin/jobdesk/agenda": ["./assets/agenda/**/*"],
    "/api/worksheet-pdf/**": ["./assets/fonts/**/*"],
    "/api/admin/worksheet-template": ["./assets/brand/**/*"],
    "/icon": ["./assets/brand/**/*"],
    "/apple-icon": ["./assets/brand/**/*"],
    "/opengraph-image": ["./assets/brand/**/*"],
  },
  experimental: {
    // Upload materi PDF (maks 10 MB) lewat Server Action
    serverActions: { bodySizeLimit: "12mb" },
    proxyClientMaxBodySize: "12mb",
  },
};

export default nextConfig;
