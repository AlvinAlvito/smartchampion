import "server-only";
import type { Jenjang } from "@prisma/client";
import { KELAS_BY_JENJANG } from "./constants";
import { resolveWilayah } from "./wilayah";

/** Validasi field jenjang, kelas, provinsi & kab/kota dari form registrasi / profil. */
export async function parseStudentFields(form: FormData) {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const fieldErrors: Record<string, string[]> = {};

  const jenjang = get("jenjang");
  if (!(jenjang in KELAS_BY_JENJANG)) fieldErrors.jenjang = ["Pilih jenjang"];
  const kelas = get("kelas");
  if (!kelas) fieldErrors.kelas = [jenjang === "UMUM" ? "Pilih status" : "Pilih kelas"];
  else if (!fieldErrors.jenjang && !KELAS_BY_JENJANG[jenjang].includes(kelas)) fieldErrors.kelas = ["Kelas tidak sesuai dengan jenjang"];

  const provinsiKode = get("provinsiKode");
  const kabKotaKode = get("kabKotaKode");
  let wilayah: Awaited<ReturnType<typeof resolveWilayah>> = null;
  if (!provinsiKode) fieldErrors.provinsiKode = ["Pilih provinsi"];
  if (!kabKotaKode) fieldErrors.kabKotaKode = ["Pilih kabupaten / kota"];
  if (provinsiKode && kabKotaKode) {
    wilayah = await resolveWilayah(provinsiKode, kabKotaKode);
    if (!wilayah) fieldErrors.kabKotaKode = ["Kabupaten / kota tidak sesuai dengan provinsi"];
  }

  if (Object.keys(fieldErrors).length || !wilayah) return { fieldErrors };
  return { data: { jenjang: jenjang as Jenjang, kelas, ...wilayah } };
}
