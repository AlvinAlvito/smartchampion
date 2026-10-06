"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Pencil, Save, UserCog, UserPlus } from "lucide-react";
import { saveUserAction, toggleUserActiveAction } from "@/app/actions/users";
import { impersonateAction } from "@/app/actions/impersonate";
import { ROLE_LABEL } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";
import { ConfirmButton, Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Spinner, SubmitButton, useFormAction } from "@/components/form-buttons";
import { Badge, Field } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";

export type UserRow = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  kelas?: string | null;
  domisili?: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
  leads: number;
  registrations: number;
};

const ROLE_TONE = { ROOT: "red", SUPERADMIN: "navy", ADMIN: "brand", SMARTCHAMPION: "blue", PESERTA: "gray" } as const;

function UserDialog({ user, isSelf, onClose }: { user: UserRow | null; isSelf: boolean; onClose: () => void }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(saveUserAction, { onSuccess: onClose });
  const u = user;
  return (
    <Modal
      open
      onClose={onClose}
      icon={u ? UserCog : UserPlus}
      title={u ? "Edit akun" : "Tambah akun"}
      description={u ? u.email : "Buat akun superadmin, admin pelatihan, admin SmartChampion, atau peserta."}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form="user-form" pending={pending}>
            <Save className="h-4 w-4" /> {u ? "Simpan" : "Buat akun"}
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id="user-form" className="grid gap-4 sm:grid-cols-2">
        {u && <input type="hidden" name="id" value={u.id} />}
        <Field label="Nama *" htmlFor="name" errors={fe?.name} className="sm:col-span-2">
          <input id="name" name="name" defaultValue={u?.name} className="input" />
        </Field>
        <Field label="Email *" htmlFor="email" errors={fe?.email}>
          <input id="email" name="email" type="email" defaultValue={u?.email} className="input" />
        </Field>
        <Field label="No. WhatsApp" htmlFor="phone">
          <input id="phone" name="phone" defaultValue={u?.phone ?? ""} className="input" />
        </Field>
        <Field
          label="Role *"
          htmlFor="role"
          errors={fe?.role}
          hint={
            isSelf
              ? "Role akun sendiri tidak bisa diubah."
              : "Admin SmartChampion hanya mengelola produk & materi, peserta terdaftar, tutor, games, dan chatbot (tanpa data lead & keuangan)."
          }
        >
          {isSelf && <input type="hidden" name="role" value={u!.role} />}
          <select id="role" name="role" defaultValue={u?.role ?? "ADMIN"} className="input" disabled={isSelf}>
            {Object.entries(ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={u ? "Password baru" : "Password *"}
          htmlFor="password"
          errors={fe?.password}
          hint={u ? "Kosongkan jika tidak diganti." : "Minimal 8 karakter."}
        >
          <PasswordInput id="password" name="password" autoComplete="new-password" />
        </Field>
        {u && !isSelf && (
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-navy-50/60 px-4 py-3 sm:col-span-2">
            <span className="text-sm font-semibold text-navy-800">Akun aktif</span>
            <input type="checkbox" name="isActive" defaultChecked={u.isActive} className="h-5 w-5 accent-brand-600" />
          </label>
        )}
      </form>
    </Modal>
  );
}

function ActiveToggle({ user, disabled }: { user: UserRow; disabled: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          if (toast.fromResult(await toggleUserActiveAction(user.id))) router.refresh();
        })
      }
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50",
        user.isActive ? "bg-linear-to-r from-brand-500 to-brand-700" : "bg-navy-200",
      )}
      aria-label={user.isActive ? "Nonaktifkan" : "Aktifkan"}
      title={disabled ? "Tidak bisa menonaktifkan akun sendiri" : user.isActive ? "Nonaktifkan akun" : "Aktifkan akun"}
    >
      <span className={cn("grid h-5 w-5 place-items-center rounded-full bg-white shadow transition", user.isActive ? "translate-x-5" : "translate-x-0.5")}>
        {pending && <Spinner className="h-3 w-3 text-brand-600" />}
      </span>
    </button>
  );
}

export function UsersTable({ users, meId, canImpersonate }: { users: UserRow[]; meId: number; canImpersonate: boolean }) {
  const [dialog, setDialog] = useState<{ open: boolean; user: UserRow | null }>({ open: false, user: null });
  return (
    <>
      <div className="mb-3 flex justify-end">
        <button className="btn-primary" onClick={() => setDialog({ open: true, user: null })}>
          <UserPlus className="h-4 w-4" /> Tambah akun
        </button>
      </div>
      <div id="tabel" className="card scroll-mt-24 overflow-x-auto p-0!">
        <table className="table min-w-[760px]">
          <thead>
            <tr>
              <th>Pengguna</th>
              <th>Role</th>
              <th>Aktivitas</th>
              <th>Bergabung</th>
              <th>Aktif</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id} className="animate-fade-in" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                <td>
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-brand-500 to-navy-700 text-sm font-bold text-white">
                      {u.name.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-navy-900">
                        {u.name} {u.id === meId && <span className="text-xs font-medium text-brand-600">(Anda)</span>}
                      </p>
                      <p className="truncate text-xs text-navy-400">{u.email}</p>
                      {(u.kelas || u.domisili) && <p className="truncate text-xs text-navy-500">{[u.kelas, u.domisili].filter(Boolean).join(" · ")}</p>}
                    </div>
                  </div>
                </td>
                <td>
                  <Badge tone={ROLE_TONE[u.role as keyof typeof ROLE_TONE]}>{ROLE_LABEL[u.role]}</Badge>
                </td>
                <td className="text-xs text-navy-500">
                  {u.role === "PESERTA" ? `${u.registrations} pendaftaran` : u.role === "SMARTCHAMPION" ? "Konten & pendaftar" : `${u.leads} lead`}
                </td>
                <td className="text-xs text-navy-500">{formatDate(u.createdAt)}</td>
                <td>
                  <ActiveToggle user={u} disabled={u.id === meId} />
                </td>
                <td>
                  <div className="flex items-center justify-end gap-1">
                    {canImpersonate && u.id !== meId && u.role !== "ROOT" && u.role !== "SUPERADMIN" && u.isActive && (
                      <ConfirmButton
                        className="btn-secondary btn-sm whitespace-nowrap"
                        ariaLabel={`Masuk sebagai ${u.name}`}
                        tone="primary"
                        title={`Masuk sebagai ${u.name}?`}
                        confirmText="Ya, masuk"
                        message={
                          <>
                            Anda akan melihat dan bertindak sebagai <b>{u.name}</b> ({ROLE_LABEL[u.role]}). Semua perubahan yang Anda lakukan tercatat atas nama
                            akun ini. Klik <b>Kembali ke superadmin</b> kapan saja untuk kembali.
                          </>
                        }
                        action={() => impersonateAction(u.id)}
                      >
                        <LogIn className="h-4 w-4 text-brand-600" /> Masuk sebagai
                      </ConfirmButton>
                    )}
                    <button className="btn-icon" onClick={() => setDialog({ open: true, user: u })} aria-label={`Edit ${u.name}`} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!users.length && (
              <tr>
                <td colSpan={6} className="py-14 text-center text-navy-400">
                  Tidak ada pengguna yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog.open && <UserDialog user={dialog.user} isSelf={dialog.user?.id === meId} onClose={() => setDialog({ open: false, user: null })} />}
    </>
  );
}
