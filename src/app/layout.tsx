import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Carter_One, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { FlashToaster, ToastProvider } from "@/components/toast";
import { NavProgress } from "@/components/nav-progress";
import { BottomNav } from "@/components/bottom-nav";
import { NoZoom } from "@/components/no-zoom";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { ChatWidget } from "@/components/chatbot/chat-widget";
import { getSession } from "@/lib/session";
import { SITE_KEYWORDS, SITE_META_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/seo";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// judul tampilan bergaya Smart Champion
const carter = Carter_One({ variable: "--font-carter", weight: "400", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_META_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  category: "education",
  // canonical & og:url sengaja TIDAK di sini (akan diwarisi semua halaman) — diatur per halaman
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_META_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_META_DESCRIPTION },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  formatDetection: { telephone: false },
  // kode verifikasi Google Search Console (opsional, isi di .env)
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
};

export const viewport: Viewport = {
  themeColor: "#0f2436",
  viewportFit: "cover",
  // Kunci skala layar (tidak bisa di-zoom/pinch) agar terasa seperti aplikasi di HP
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  return (
    <html lang="id">
      <body className={`${jakarta.variable} ${geistMono.variable} ${carter.variable} min-h-screen antialiased`}>
        <NoZoom />
        <ToastProvider>
          <Suspense fallback={null}>
            <NavProgress />
            <FlashToaster />
          </Suspense>
          {children}
          {/* Satu navbar bawah permanen untuk peserta (tidak di-unmount saat pindah halaman) */}
          <BottomNav enabled={session?.role === "PESERTA"} />
          <ImpersonationBanner />
          <ChatWidget aboveBottomNav={session?.role === "PESERTA"} raised={Boolean(session?.impersonatorId)} />
        </ToastProvider>
      </body>
    </html>
  );
}
