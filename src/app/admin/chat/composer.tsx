"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CornerDownLeft, LoaderCircle, RefreshCw, Search, SendHorizonal, Settings2, Sparkles, TriangleAlert, X, Zap } from "lucide-react";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import { WA_MAX_TEXT } from "@/lib/wa-shared";
import { EmojiPicker } from "@/components/emoji-picker";
import { getJson, postJson } from "./use-poll";
import { TemplatesDialog, type WaTemplateRow } from "./templates-dialog";

type Suggestion = { text: string; note: string | null; sure: boolean; clone: string | null };

const COARSE = "(pointer: coarse)";
function subscribeCoarse(cb: () => void) {
  const mq = window.matchMedia(COARSE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** Isi variabel template: {nama} = nama depan customer, {admin} = nama admin */
function fill(body: string, customer: string | null, admin: string) {
  const first = (customer ?? "").trim().split(/\s+/)[0] ?? "";
  const nama = first && !/^[+\d]/.test(first) ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : "";
  return body
    .replace(/\{nama\}/gi, nama)
    .replace(/\{admin\}/gi, admin)
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .slice(0, WA_MAX_TEXT);
}

/**
 * Kolom tulis balasan Chat WA:
 * - "/pintasan" atau tombol ⚡ → template balasan cepat
 * - ✨ Saran AI → draf jawaban dari 8 pesan terakhir (tidak terkirim otomatis)
 * - ↵ baris baru; di HP/layar sentuh tombol Enter = baris baru (kirim lewat tombol kirim)
 */
export function Composer({
  chatId,
  canReply,
  disabledHint,
  customerName,
  isGroup,
  onSend,
}: {
  chatId: number;
  canReply: boolean;
  disabledHint: string;
  customerName: string | null;
  isGroup: boolean;
  /** kirim teks; true bila berhasil (kolom dikosongkan) */
  onSend: (text: string) => Promise<boolean>;
}) {
  const toast = useToast();
  const input = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<WaTemplateRow[]>([]);
  const [adminName, setAdminName] = useState("");
  const [picker, setPicker] = useState(false); // daftar template (tombol ⚡)
  const [pickerQ, setPickerQ] = useState("");
  const [manage, setManage] = useState(false);
  const [sel, setSel] = useState(0);
  const [suggest, setSuggest] = useState<Suggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  // layar sentuh (HP/tablet): Enter = baris baru, seperti aplikasi WhatsApp
  const touch = useSyncExternalStore(subscribeCoarse, () => window.matchMedia(COARSE).matches, () => false);

  const loadTemplates = async () => {
    const r = await getJson<{ templates: WaTemplateRow[]; adminName?: string }>("/api/admin/wa/templates").catch(() => null);
    if (r) {
      setTemplates(r.templates);
      setAdminName(r.adminName ?? "");
    }
  };
  useEffect(() => {
    let alive = true;
    void getJson<{ templates: WaTemplateRow[]; adminName?: string }>("/api/admin/wa/templates")
      .then((r) => {
        if (!alive) return;
        setTemplates(r.templates);
        setAdminName(r.adminName ?? "");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // "/coc" di awal kolom → saring template
  const slash = /^\/[\w-]*$/.test(text) ? text.slice(1).toLowerCase() : null;
  const matches = useMemo(() => {
    const q = (slash ?? pickerQ).trim().toLowerCase();
    const list = q ? templates.filter((t) => t.shortcut.includes(q) || t.title.toLowerCase().includes(q) || (slash === null && t.body.toLowerCase().includes(q))) : templates;
    // pintasan yang diawali kata kunci didahulukan
    return [...list].sort((a, b) => Number(b.shortcut.startsWith(q)) - Number(a.shortcut.startsWith(q))).slice(0, 30);
  }, [templates, slash, pickerQ]);
  const listOpen = slash !== null || picker;
  const active = Math.min(sel, Math.max(0, matches.length - 1));

  const focusEnd = (value: string) =>
    requestAnimationFrame(() => {
      const el = input.current;
      el?.focus();
      el?.setSelectionRange(value.length, value.length);
    });

  const insertAtCursor = (s: string) => {
    const el = input.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + s + text.slice(end)).slice(0, WA_MAX_TEXT);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + s.length, start + s.length);
    });
  };

  const send = async (value = text) => {
    const body = value.trim();
    if (!body || sending) return;
    setSending(true);
    const ok = await onSend(body);
    setSending(false);
    if (ok) {
      setText("");
      setSuggest(null);
    }
  };

  const applyTemplate = (t: WaTemplateRow, sendNow = false) => {
    const value = fill(t.body, isGroup ? null : customerName, adminName);
    void postJson("/api/admin/wa/templates", { used: t.id });
    setPicker(false);
    setPickerQ("");
    setSel(0);
    if (sendNow) return void send(value);
    setText(value);
    focusEnd(value);
  };

  const askAi = async () => {
    setSuggesting(true);
    const r = await postJson<Suggestion>("/api/admin/wa/suggest", { chatId });
    setSuggesting(false);
    if (r.error || !r.text) return toast.error(r.error ?? "AI belum bisa memberi saran.");
    setSuggest({ text: r.text, note: r.note ?? null, sure: !!r.sure, clone: r.clone ?? null });
  };

  const chip = "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-50";

  return (
    <div className="relative">
      {/* saran jawaban AI */}
      {suggest && (
        <div className="mb-2 rounded-2xl border border-violet-200 bg-violet-50 p-3">
          <div className="mb-1.5 flex items-center gap-2 text-xs font-bold text-violet-800">
            <Sparkles className="h-3.5 w-3.5" />
            Saran jawaban AI{suggest.clone ? ` · gaya ${suggest.clone}` : ""}
            <button className="ml-auto rounded-full p-1 text-violet-500 hover:bg-violet-100" onClick={() => setSuggest(null)} aria-label="Tutup saran">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm text-navy-800">{suggest.text}</p>
          {suggest.note && (
            <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-amber-700">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {suggest.note}
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              className={cn(chip, "bg-violet-600 text-white hover:bg-violet-700")}
              onClick={() => {
                setText(suggest.text);
                setSuggest(null);
                focusEnd(suggest.text);
              }}
            >
              Pakai & edit
            </button>
            <button className={cn(chip, "bg-white text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100")} onClick={askAi} disabled={suggesting}>
              {suggesting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Buat ulang
            </button>
          </div>
        </div>
      )}

      {/* daftar template: muncul saat mengetik "/" atau menekan ⚡ */}
      {listOpen && canReply && (
        <div className="absolute inset-x-0 bottom-full z-30 mb-2 max-h-72 overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-2xl">
          <div className="flex items-center gap-2 border-b border-navy-50 px-3 py-2">
            <Zap className="h-4 w-4 shrink-0 text-amber-500" />
            {picker ? (
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-navy-300" />
                <input autoFocus value={pickerQ} onChange={(e) => (setPickerQ(e.target.value), setSel(0))} placeholder="Cari template…" className="input h-8 py-1! pl-8 text-sm" aria-label="Cari template" />
              </div>
            ) : (
              <span className="min-w-0 flex-1 truncate text-xs font-bold text-navy-600">Template · ↑↓ pilih, Enter pakai</span>
            )}
            <button
              className="btn-ghost btn-sm shrink-0"
              onClick={() => {
                setManage(true);
                setPicker(false);
              }}
            >
              <Settings2 className="h-3.5 w-3.5" /> Kelola
            </button>
            {picker && (
              <button className="btn-icon h-8 w-8 shrink-0" onClick={() => setPicker(false)} aria-label="Tutup template">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <ul className="max-h-56 overflow-y-auto p-1.5">
            {matches.map((t, i) => (
              <li key={t.id} className={cn("flex items-stretch gap-1 rounded-xl", i === active ? "bg-brand-50" : "hover:bg-navy-50/70")}>
                <button className="min-w-0 flex-1 px-2.5 py-2 text-left" onMouseEnter={() => setSel(i)} onClick={() => applyTemplate(t)}>
                  <span className="flex items-center gap-2">
                    <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber-800">/{t.shortcut}</span>
                    <span className="truncate text-sm font-semibold text-navy-800">{t.title}</span>
                    {!t.mine && <span className="shrink-0 text-[10px] text-navy-400">· {t.ownerName}</span>}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block whitespace-pre-line text-xs text-navy-500">{t.body}</span>
                </button>
                <button
                  className="grid w-10 shrink-0 place-items-center rounded-xl text-brand-600 hover:bg-brand-100"
                  onClick={() => applyTemplate(t, true)}
                  title="Kirim langsung"
                  aria-label={`Kirim langsung template ${t.title}`}
                >
                  <SendHorizonal className="h-4 w-4" />
                </button>
              </li>
            ))}
            {!matches.length && (
              <li className="p-4 text-center text-sm text-navy-400">
                {templates.length ? "Tidak ada template yang cocok." : "Belum ada template."}{" "}
                <button className="font-bold text-brand-600 hover:underline" onClick={() => (setManage(true), setPicker(false))}>
                  Buat template
                </button>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* tombol cepat */}
      {canReply && (
        <div className="mb-2 flex items-center gap-1.5 overflow-x-auto">
          <button
            className={cn(chip, picker ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100")}
            onClick={() => (setPicker((p) => !p), setSel(0))}
            disabled={sending}
            title="Template balasan (atau ketik / di kolom chat)"
          >
            <Zap className="h-3.5 w-3.5" /> Template
          </button>
          {!isGroup && (
            <button
              className={cn(chip, "bg-violet-50 text-violet-800 ring-1 ring-violet-200 hover:bg-violet-100")}
              onClick={askAi}
              disabled={suggesting || sending}
              title="AI membaca 8 pesan terakhir lalu menyarankan jawaban"
            >
              {suggesting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {suggesting ? "AI berpikir…" : "Saran AI"}
            </button>
          )}
          <button
            className={cn(chip, "bg-navy-50 text-navy-700 ring-1 ring-navy-100 hover:bg-navy-100", !touch && "sm:hidden")}
            onClick={() => insertAtCursor("\n")}
            disabled={sending}
            title="Baris baru"
          >
            <CornerDownLeft className="h-3.5 w-3.5" /> Baris baru
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <EmojiPicker onPick={insertAtCursor} disabled={!canReply || sending} />
        <textarea
          ref={input}
          value={text}
          onChange={(e) => (setText(e.target.value.slice(0, WA_MAX_TEXT)), setSel(0))}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            // navigasi daftar template "/…"
            if (slash !== null && matches.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => (Math.min(s, matches.length - 1) + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                applyTemplate(matches[active]);
                return;
              }
            }
            if (e.key === "Escape" && (picker || slash !== null)) {
              setPicker(false);
              if (slash !== null) setText("");
              return;
            }
            // laptop: Enter kirim, Shift+Enter baris baru · HP: Enter baris baru (kirim lewat tombol)
            if (e.key === "Enter" && !e.shiftKey && !touch) {
              e.preventDefault();
              void send();
            }
          }}
          rows={Math.min(6, Math.max(1, text.split("\n").length))}
          enterKeyHint={touch ? "enter" : "send"}
          placeholder={canReply ? (touch ? "Tulis balasan… (ketik / untuk template)" : "Tulis balasan… (Enter kirim · Shift+Enter baris baru · / template)") : disabledHint}
          disabled={!canReply || sending}
          className="input max-h-44 min-h-11 resize-none"
          aria-label="Tulis balasan"
        />
        <button className="btn-primary h-11 w-11 shrink-0 px-0!" onClick={() => void send()} disabled={!canReply || sending || !text.trim()} aria-label="Kirim">
          {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
        </button>
      </div>

      {manage && (
        <TemplatesDialog
          templates={templates}
          onClose={() => {
            setManage(false);
            void loadTemplates();
          }}
          onChanged={loadTemplates}
        />
      )}
    </div>
  );
}
