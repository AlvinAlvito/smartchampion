import Link from "next/link";
import { CalendarRange, Contact, FileSpreadsheet } from "lucide-react";
import { RANGE_PRESETS, type DateRange } from "@/lib/date-range";
import { cn } from "@/lib/utils";

/** Query periode aktif (preset atau from/to) untuk diteruskan ke unduhan / halaman lain */
export function rangeQuery(range: DateRange) {
  return new URLSearchParams(
    range.preset === "custom" ? { ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) } : { preset: range.preset },
  ).toString();
}

/** Master Lead dengan filter yang sama dengan grafik penjualan: Paid + tanggal bayar dalam periode */
export function salesLeadsHref(range: DateRange, ownerId?: number) {
  const p = new URLSearchParams({ status: "Paid", tgl: "bayar" });
  if (range.from) p.set("from", range.from);
  if (range.to) p.set("to", range.to);
  if (ownerId) p.set("owner", String(ownerId));
  return `/admin/leads?${p.toString()}#tabel`;
}

/**
 * Filter periode (preset + tanggal kustom) untuk halaman statistik.
 * `salesExport` → tombol Ekspor Excel (data di balik grafik penjualan) + tautan bukti ke Master Lead.
 */
export function RangeFilter({
  basePath,
  range,
  note,
  salesExport,
  presets = RANGE_PRESETS,
  extraQuery,
}: {
  basePath: string;
  range: DateRange;
  note?: React.ReactNode;
  salesExport?: { ownerId?: number };
  /** pilihan preset (bawaan: preset halaman penjualan) */
  presets?: readonly { v: string; l: string }[];
  /** parameter lain yang dipertahankan saat periode diganti (mis. tab tim) */
  extraQuery?: Record<string, string>;
}) {
  const keep = extraQuery ? Object.entries(extraQuery).filter(([, v]) => v) : [];
  const keepQs = keep.length ? `&${new URLSearchParams(keep).toString()}` : "";
  return (
    <div className="card mb-4 flex animate-fade-up flex-wrap items-end gap-3">
      <CalendarRange className="hidden h-10 w-10 rounded-2xl bg-brand-50 p-2.5 text-brand-600 sm:block" />
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <Link
            key={p.v}
            href={`${basePath}?preset=${p.v}${keepQs}`}
            scroll={false}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium",
              range.preset === p.v
                ? "bg-linear-to-r from-brand-600 to-navy-700 text-white shadow-md shadow-brand-500/25"
                : "bg-navy-50 text-navy-600 hover:bg-brand-50 hover:text-brand-700",
            )}
          >
            {p.l}
          </Link>
        ))}
      </div>
      <form action={basePath} className="ml-auto flex flex-wrap items-end gap-2">
        {keep.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <div>
          <label className="label text-xs!" htmlFor="from">
            Dari
          </label>
          <input id="from" name="from" type="date" defaultValue={range.from} className="input py-1.5!" />
        </div>
        <div>
          <label className="label text-xs!" htmlFor="to">
            Sampai
          </label>
          <input id="to" name="to" type="date" defaultValue={range.to} className="input py-1.5!" />
        </div>
        <button className="btn-primary">Terapkan</button>
      </form>
      {(note || salesExport) && (
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {note && <p className="min-w-0 flex-1 text-xs text-navy-500">{note}</p>}
          {salesExport && (
            <div className="flex flex-wrap gap-2">
              <Link
                href={salesLeadsHref(range, salesExport.ownerId)}
                className="btn-ghost btn-sm"
                title="Buka Master Lead: status Paid & tanggal bayar dalam periode ini — data yang dihitung grafik"
              >
                <Contact className="h-3.5 w-3.5 text-brand-600" /> Lihat datanya di Master Lead
              </Link>
              <a
                href={`/api/admin/sales/export?${rangeQuery(range)}`}
                className="btn-secondary btn-sm"
                title="Ringkasan + rincian setiap transaksi Paid yang dihitung grafik pada periode ini"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Ekspor Excel penjualan
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
