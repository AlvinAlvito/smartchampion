"use client";

import { createContext, useContext, useEffect } from "react";
import { Eye } from "lucide-react";

/**
 * Mode lihat saja (akun Superadmin): tombol simpan/hapus dinonaktifkan & tautan unduhan dimatikan.
 * Pengaman sebenarnya tetap di server (requireUser menolak server action, rute unduhan membalas 403).
 */
const ReadOnlyContext = createContext(false);

export const useReadOnly = () => useContext(ReadOnlyContext);

export const READ_ONLY_TITLE = "Mode lihat saja — akun Superadmin tidak bisa mengubah data";

export function ReadOnlyProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // dipasang di <html> agar ikut berlaku untuk isi modal (portal)
    document.documentElement.setAttribute("data-readonly", "");
    return () => document.documentElement.removeAttribute("data-readonly");
  }, []);
  return (
    <ReadOnlyContext.Provider value={true}>
      <div className="mb-5 flex items-start gap-2.5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200" role="status">
        <Eye className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <b>Mode lihat saja.</b> Akun Superadmin bisa melihat semua menu, tetapi tidak bisa menambah, mengubah, menghapus, atau mengunduh data.
        </p>
      </div>
      {children}
    </ReadOnlyContext.Provider>
  );
}
