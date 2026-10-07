/**
 * Backup Pelatihan POSI → Google Spreadsheet (penerima data dari server).
 *
 * CARA PASANG (sekali saja, oleh pemilik spreadsheet):
 * 1. Buka spreadsheet backup → menu Extensions → Apps Script.
 * 2. Hapus isi Code.gs, tempel SELURUH isi file ini, ganti nilai TOKEN di bawah dengan token dari admin teknis, lalu Save.
 * 3. Klik Deploy → New deployment → ikon gerigi → Web app.
 *      Description : Backup Pelatihan POSI
 *      Execute as  : Me (akun pemilik spreadsheet)
 *      Who has access : Anyone
 *    Klik Deploy → Authorize access → pilih akun → (Advanced → Go to … (unsafe)) → Allow.
 * 4. Salin "Web app URL" (berakhiran /exec) dan berikan ke admin teknis.
 *
 * Catatan keamanan:
 * - Data hanya bisa ditulis oleh pengirim yang memegang TOKEN yang sama.
 * - Atur Share spreadsheet ke "Restricted" (bukan "Anyone with the link") karena berisi data pribadi peserta,
 *   dan karena editor spreadsheet bisa membuka skrip ini (termasuk TOKEN-nya).
 * - Tiap backup mengganti isi sheet dengan data terbaru; versi lama tetap ada di File → Version history.
 * - Bila jumlah baris sebuah tabel turun > 50% (mis. database bermasalah), sheet itu TIDAK ditimpa (DITAHAN).
 */

const TOKEN = "ISI_TOKEN_DI_SINI";
const INFO_SHEET = "Info Backup";
const LOG_SHEET = "Riwayat Backup";
const CHUNK = 5000;

function doGet() {
  return json_({ ok: true, message: "Endpoint backup Pelatihan POSI aktif." });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return json_({ ok: false, error: "Backup lain sedang berjalan." });
  try {
    const body = JSON.parse(e.postData.contents);
    if (!TOKEN || TOKEN.indexOf("ISI_") === 0 || body.token !== TOKEN) return json_({ ok: false, error: "Token tidak cocok." });
    if (!Array.isArray(body.sheets) || !body.sheets.length) return json_({ ok: false, error: "Data kosong." });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const result = body.sheets.map(function (s, i) {
      return writeSheet_(ss, s, i, body.force === true);
    });
    removeEmptyDefaultSheet_(ss);
    writeInfo_(ss, body, result);
    return json_({ ok: true, sheets: result });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

/** Tulis ke sheet sementara dulu, baru tukar dengan sheet lama → sheet lama tetap utuh bila penulisan gagal. */
function writeSheet_(ss, s, index, force) {
  const old = ss.getSheetByName(s.name);
  const oldRows = old ? Math.max(0, old.getLastRow() - 1) : 0;
  const newRows = s.rows.length;
  if (!force && oldRows >= 20 && newRows < oldRows * 0.5) {
    return { name: s.name, rows: oldRows, status: "DITAHAN (" + newRows + " < " + oldRows + ")" };
  }

  const tmpName = s.name + " (baru)";
  const stale = ss.getSheetByName(tmpName);
  if (stale) ss.deleteSheet(stale);
  const tmp = ss.insertSheet(tmpName);
  const cols = Math.max(1, s.columns.length);
  const total = newRows + 1;
  if (tmp.getMaxColumns() < cols) tmp.insertColumnsAfter(tmp.getMaxColumns(), cols - tmp.getMaxColumns());
  if (tmp.getMaxRows() < total) tmp.insertRowsAfter(tmp.getMaxRows(), total - tmp.getMaxRows());

  // format teks: nomor HP "0812…" & kode tetap utuh (tidak berubah jadi angka/tanggal)
  tmp.getRange(1, 1, total, cols).setNumberFormat("@");
  tmp.getRange(1, 1, 1, cols).setValues([s.columns]).setFontWeight("bold").setBackground("#dbeafe");
  for (let r = 0; r < newRows; r += CHUNK) {
    const chunk = s.rows.slice(r, r + CHUNK).map(function (row) {
      return row.map(safe_);
    });
    tmp.getRange(r + 2, 1, chunk.length, cols).setValues(chunk);
  }
  tmp.setFrozenRows(1);

  if (old) ss.deleteSheet(old);
  tmp.setName(s.name);
  ss.setActiveSheet(tmp);
  ss.moveActiveSheet(index + 1);
  return { name: s.name, rows: newRows, status: "OK" };
}

/** Cegah teks diartikan sebagai rumus (mis. nama yang diawali "=") */
function safe_(v) {
  if (typeof v === "string" && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function removeEmptyDefaultSheet_(ss) {
  ["Sheet1", "Lembar1"].forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
}

function writeInfo_(ss, body, result) {
  let info = ss.getSheetByName(INFO_SHEET);
  if (!info) info = ss.insertSheet(INFO_SHEET);
  info.clear();
  const total = result.reduce(function (a, r) {
    return a + r.rows;
  }, 0);
  const rows = [
    ["Backup data Pelatihan POSI", ""],
    ["Backup terakhir", body.generatedAt || new Date().toString()],
    ["Pemicu", body.reason || "-"],
    ["Total baris", String(total)],
    ["", ""],
    ["Sheet", "Baris · Status"],
  ].concat(
    result.map(function (r) {
      return [r.name, r.rows + " · " + r.status];
    }),
  );
  info.getRange(1, 1, rows.length, 2).setNumberFormat("@").setValues(rows);
  info.getRange(1, 1).setFontWeight("bold").setFontSize(13);
  info.getRange(6, 1, 1, 2).setFontWeight("bold").setBackground("#dbeafe");
  info.setColumnWidth(1, 220);
  info.setColumnWidth(2, 260);
  ss.setActiveSheet(info);
  ss.moveActiveSheet(result.length + 1);

  let log = ss.getSheetByName(LOG_SHEET);
  if (!log) {
    log = ss.insertSheet(LOG_SHEET);
    log.getRange(1, 1, 1, 4).setValues([["Waktu", "Pemicu", "Total baris", "Sheet ditahan"]]).setFontWeight("bold");
    log.setFrozenRows(1);
  }
  const held = result.filter(function (r) {
    return r.status !== "OK";
  });
  log.appendRow([body.generatedAt || new Date().toString(), body.reason || "-", total, held.map((r) => r.name).join(", ") || "-"]);
  if (log.getLastRow() > 1001) log.deleteRows(2, log.getLastRow() - 1001);
  ss.setActiveSheet(log);
  ss.moveActiveSheet(result.length + 2);
  ss.setActiveSheet(ss.getSheets()[0]);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
