import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "./register-form";
import { NOINDEX } from "@/lib/seo";

export const metadata = { title: "Daftar Akun Peserta", ...NOINDEX };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";
  return (
    <AuthShell
      title="Buat akun peserta ✨"
      subtitle="Gratis. Dipakai untuk mendaftar kelas COC, mengakses materi, dan bermain games."
      footer={
        <>
          Sudah punya akun?{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-bold text-brand-600 hover:underline">
            Masuk
          </Link>
        </>
      }
    >
      <RegisterForm next={next} />
    </AuthShell>
  );
}
