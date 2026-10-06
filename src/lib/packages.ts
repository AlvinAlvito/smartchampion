/** Utilitas paket pertemuan VIP Privat (dipakai server & browser). */

export type PackageLike = { id: number; sessions: number; price: number; label: string | null };

/** Persen hemat dibanding harga normal (jumlah pertemuan × harga per pertemuan). */
export function packageSavings(pkg: { sessions: number; price: number }, pricePerSession: number) {
  const normal = pkg.sessions * pricePerSession;
  return normal > pkg.price ? Math.round(((normal - pkg.price) / normal) * 100) : 0;
}

export const perSession = (pkg: { sessions: number; price: number }) => Math.round(pkg.price / Math.max(1, pkg.sessions));

/** Paket bawaan saat kelas VIP Privat baru dibuat (bisa diubah admin). */
export function defaultPackages(pricePerSession: number) {
  return [
    { sessions: 1, price: pricePerSession, label: null },
    { sessions: 4, price: pricePerSession * 4, label: null },
    { sessions: 8, price: pricePerSession * 8, label: "Terlaris" },
  ];
}
