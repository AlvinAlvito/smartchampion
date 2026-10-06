import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";
import { NOINDEX } from "@/lib/seo";

export const metadata = { title: "Masuk", ...NOINDEX };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";
  return (
    <AuthShell
      title="Selamat datang kembali 👋"
      subtitle="Masuk sebagai peserta, admin pelatihan, atau superadmin."
      footer={
        <>
          Belum punya akun?{" "}
          <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-bold text-brand-600 hover:underline">
            Daftar sebagai peserta
          </Link>
        </>
      }
    >
      {sp.expired === "1" && (
        <p className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-100">
          Sesi Anda sudah berakhir (password diganti atau akun diubah admin). Silakan masuk kembali.
        </p>
      )}
      <LoginForm next={next} />
    </AuthShell>
  );
}
