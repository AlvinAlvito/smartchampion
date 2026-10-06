"use client";

import { useEffect, useState } from "react";
import { KELAS_BY_JENJANG } from "@/lib/constants";
import { Field } from "@/components/ui";

type Wilayah = { kode: string; nama: string };

// cache sederhana per halaman agar ganti-ganti provinsi tidak memanggil API berulang
const cache = new Map<string, Promise<Wilayah[]>>();
function load(url: string) {
  if (!cache.has(url)) {
    const p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<Wilayah[]>;
    });
    p.catch(() => cache.delete(url)); // gagal → boleh dicoba lagi
    cache.set(url, p);
  }
  return cache.get(url)!;
}

const JENJANG = [
  { v: "SD", l: "SD / sederajat" },
  { v: "SMP", l: "SMP / sederajat" },
  { v: "SMA", l: "SMA / sederajat" },
  { v: "UMUM", l: "Umum" },
];

export type StudentDefaults = { jenjang?: string | null; kelas?: string | null; provinsiKode?: string | null; kabKotaKode?: string | null };

/**
 * Field jenjang → kelas, dan provinsi → kabupaten/kota (data wilayah.id lewat /api/wilayah).
 * Dirender sebagai beberapa <Field> agar mengikuti grid form induknya (2 kolom).
 */
export function StudentFields({ defaults = {}, errors }: { defaults?: StudentDefaults; errors?: Record<string, string[] | undefined> }) {
  const [jenjang, setJenjang] = useState(defaults.jenjang ?? "SMP");
  const [kelas, setKelas] = useState(defaults.kelas ?? "");
  const kelasOptions = KELAS_BY_JENJANG[jenjang] ?? [];
  // nilai lama di luar daftar (mis. data lama) tetap ditampilkan
  const kelasList = kelas && !kelasOptions.includes(kelas) ? [kelas, ...kelasOptions] : kelasOptions;

  const [provinsi, setProvinsi] = useState<Wilayah[] | null>(null);
  const [provKode, setProvKode] = useState(defaults.provinsiKode ?? "");
  const [kabKota, setKabKota] = useState<Wilayah[] | null>(null);
  const [kabKode, setKabKode] = useState(defaults.kabKotaKode ?? "");
  const [loadingKab, setLoadingKab] = useState(Boolean(defaults.provinsiKode));
  const [failed, setFailed] = useState(false);

  const loadKab = (kode: string) => {
    setKabKota(null);
    if (!kode) return;
    setLoadingKab(true);
    load(`/api/wilayah/kabupaten-kota/${kode}`)
      .then(setKabKota)
      .catch(() => setFailed(true))
      .finally(() => setLoadingKab(false));
  };

  useEffect(() => {
    let alive = true;
    load("/api/wilayah/provinsi")
      .then((d) => alive && setProvinsi(d))
      .catch(() => alive && setFailed(true));
    if (defaults.provinsiKode) {
      load(`/api/wilayah/kabupaten-kota/${defaults.provinsiKode}`)
        .then((d) => alive && setKabKota(d))
        .catch(() => alive && setFailed(true))
        .finally(() => alive && setLoadingKab(false));
    }
    return () => {
      alive = false;
    };
  }, [defaults.provinsiKode]);

  const kabupaten = kabKota?.filter((k) => !k.nama.startsWith("Kota ")) ?? [];
  const kota = kabKota?.filter((k) => k.nama.startsWith("Kota ")) ?? [];

  return (
    <>
      <Field label="Jenjang" htmlFor="jenjang" errors={errors?.jenjang}>
        <select
          id="jenjang"
          name="jenjang"
          className="input"
          value={jenjang}
          onChange={(e) => {
            setJenjang(e.target.value);
            setKelas("");
          }}
        >
          {JENJANG.map((j) => (
            <option key={j.v} value={j.v}>
              {j.l}
            </option>
          ))}
        </select>
      </Field>
      <Field label={jenjang === "UMUM" ? "Status" : "Kelas"} htmlFor="kelas" errors={errors?.kelas}>
        <select id="kelas" name="kelas" className="input" value={kelas} onChange={(e) => setKelas(e.target.value)} required>
          <option value="">{jenjang === "UMUM" ? "Pilih status" : "Pilih kelas"}</option>
          {kelasList.map((k) => (
            // tampil ringkas ("Kelas 11"); nilai tersimpan tetap lengkap ("Kelas 11 SMA/sederajat")
            <option key={k} value={k}>
              {k.replace(/ (SD|SMP|SMA)\/sederajat$/, "")}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Provinsi" htmlFor="provinsiKode" errors={errors?.provinsiKode}>
        <select
          id="provinsiKode"
          name="provinsiKode"
          className="input"
          value={provKode}
          disabled={!provinsi}
          required
          onChange={(e) => {
            setProvKode(e.target.value);
            setKabKode("");
            loadKab(e.target.value);
          }}
        >
          <option value="">{provinsi ? "Pilih provinsi" : "Memuat provinsi…"}</option>
          {provinsi?.map((p) => (
            <option key={p.kode} value={p.kode}>
              {p.nama}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Kabupaten / Kota" htmlFor="kabKotaKode" errors={errors?.kabKotaKode}>
        <select id="kabKotaKode" name="kabKotaKode" className="input" value={kabKode} disabled={!kabKota} required onChange={(e) => setKabKode(e.target.value)}>
          <option value="">{loadingKab ? "Memuat kabupaten/kota…" : provKode ? "Pilih kabupaten / kota" : "Pilih provinsi dulu"}</option>
          {kabupaten.length > 0 && (
            <optgroup label="Kabupaten">
              {kabupaten.map((k) => (
                <option key={k.kode} value={k.kode}>
                  {k.nama}
                </option>
              ))}
            </optgroup>
          )}
          {kota.length > 0 && (
            <optgroup label="Kota">
              {kota.map((k) => (
                <option key={k.kode} value={k.kode}>
                  {k.nama}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </Field>
      {failed && (
        <p className="text-xs text-rose-600 sm:col-span-2">
          Data wilayah gagal dimuat. Periksa koneksi internet lalu{" "}
          <button type="button" className="font-bold underline" onClick={() => location.reload()}>
            muat ulang halaman
          </button>
          .
        </p>
      )}
    </>
  );
}
