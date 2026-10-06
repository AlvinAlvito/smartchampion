import "server-only";
import type { Role } from "@prisma/client";
import { isReadOnly, READ_ONLY_MESSAGE } from "./session";

/**
 * Rute unduhan (Excel, PDF, file materi): akun Superadmin (mode lihat saja) ditolak dengan halaman 403 yang jelas.
 * Kembalikan Response bila diblokir, `null` bila boleh lanjut.
 */
export function blockReadOnlyDownload(role?: Role | null): Response | null {
  if (!role || !isReadOnly(role)) return null;
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tidak bisa mengunduh</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#eef8fd;font-family:system-ui,sans-serif;color:#0f2436;padding:16px}
.c{max-width:420px;background:#fff;border-radius:24px;padding:28px;text-align:center;box-shadow:0 8px 24px -12px rgba(15,36,54,.2)}
h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#475569;margin:0 0 20px}button{border:0;border-radius:14px;background:#1a6f9f;color:#fff;font-weight:600;padding:10px 18px;cursor:pointer}</style></head>
<body><div class="c"><h1>Mode lihat saja</h1><p>${READ_ONLY_MESSAGE}</p><button onclick="history.length>1?history.back():location.assign('/admin')">Kembali</button></div></body></html>`;
  return new Response(html, { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
