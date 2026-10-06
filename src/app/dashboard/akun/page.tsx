import { GraduationCap, LogOut, MapPin, TriangleAlert, UserRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { logoutAction } from "@/app/actions/auth";
import { formatDate } from "@/lib/utils";
import { PageTitle } from "@/components/ui";
import { PasswordForm, ProfileForm } from "./forms";

export const metadata = { title: "Akun Saya" };
export const dynamic = "force-dynamic";

export default async function AkunPage() {
  const session = await requireUser(["PESERTA"]);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Akun saya" subtitle="Perbarui data diri dan keamanan akunmu." icon={UserRound} />

      <div className="card relative mb-6 animate-fade-up overflow-hidden p-0!">
        <div className="relative h-24 bg-hero">
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        </div>
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          {/* Avatar menumpuk ke banner; teks tetap di area putih agar terbaca */}
          <div className="-mt-10 flex items-end justify-between gap-3">
            <span className="relative grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-linear-to-br from-brand-500 to-navy-700 text-2xl font-extrabold text-white shadow-xl ring-4 ring-white">
              {initials}
            </span>
            <form action={logoutAction}>
              <button className="btn-secondary btn-sm text-rose-600 hover:border-rose-200 hover:bg-rose-50">
                <LogOut className="h-4 w-4" /> Keluar
              </button>
            </form>
          </div>
          <div className="mt-3 min-w-0">
            <p className="wrap-break-word text-lg font-extrabold text-navy-900">{user.name}</p>
            <p className="break-all text-sm text-navy-500">{user.email}</p>
            {(user.kelas || user.kabKota) && (
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-navy-600">
                {user.kelas && (
                  <span className="inline-flex items-center gap-1">
                    <GraduationCap className="h-3.5 w-3.5 text-brand-500" /> {user.kelas}
                  </span>
                )}
                {user.kabKota && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-brand-500" /> {user.kabKota}, {user.provinsi}
                  </span>
                )}
              </p>
            )}
            <p className="mt-0.5 text-xs text-navy-400">Bergabung {formatDate(user.createdAt)}</p>
          </div>
        </div>
      </div>

      {(!user.kelas || !user.kabKota) && (
        <div className="mb-6 flex animate-fade-up items-start gap-3 rounded-3xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-100">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <p>
            <b>Lengkapi profilmu.</b> Pilih kelas serta provinsi & kabupaten/kota domisili di bawah ini, lalu simpan perubahan.
          </p>
        </div>
      )}

      <div className="grid gap-6">
        <ProfileForm
          defaults={{
            name: user.name,
            phone: user.phone ?? "",
            school: user.school ?? "",
            jenjang: user.jenjang ?? "SMP",
            kelas: user.kelas,
            provinsiKode: user.provinsiKode,
            kabKotaKode: user.kabKotaKode,
          }}
        />
        <PasswordForm />
      </div>
    </div>
  );
}
