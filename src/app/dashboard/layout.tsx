import { requireUser } from "@/lib/session";
import { DashboardHeader } from "./dashboard-header";
import { FlagCounter } from "@/components/flag-counter";
import { NOINDEX } from "@/lib/seo";

// panel & area akun tidak boleh muncul di Google
export const metadata = NOINDEX;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser(["PESERTA"]);
  return (
    <div className="min-h-screen bg-dots">
      <DashboardHeader name={session.name} />
      <main className="container-page py-6 sm:py-8">{children}</main>
      {/* penghitung pengunjung; ruang bawah agar tidak tertutup navbar bawah di HP */}
      <footer className="container-page flex justify-center pb-28 pt-2 md:pb-8">
        <FlagCounter />
      </footer>
    </div>
  );
}
