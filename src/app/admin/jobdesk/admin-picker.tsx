"use client";

import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";

/** Root & Superadmin: pilih jobdesk admin mana yang dibuka */
export function AdminPicker({ admins, value, hrefBase }: { admins: { id: number; name: string; role?: string }[]; value: number; hrefBase: string }) {
  const groups = [
    { role: "ADMIN", label: "Admin Pelatihan (sales)" },
    { role: "SMARTCHAMPION", label: "Admin SmartChampion (operasional)" },
  ].map((g) => ({ ...g, items: admins.filter((a) => (a.role ?? "ADMIN") === g.role) }));
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 rounded-2xl bg-white py-1 pl-3 pr-1 shadow-sm ring-1 ring-navy-100">
      <UserRound className="h-4 w-4 text-brand-600" />
      <span className="sr-only">Pilih admin</span>
      <select
        className="input h-9 border-0 py-1 pl-1 font-semibold shadow-none"
        value={value}
        onChange={(e) => router.push(`${hrefBase}${hrefBase.includes("?") ? "&" : "?"}user=${e.target.value}`)}
        aria-label="Pilih admin"
      >
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <optgroup key={g.role} label={g.label}>
              {g.items.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </optgroup>
          ))}
      </select>
    </label>
  );
}
