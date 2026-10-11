"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, LoaderCircle, RotateCcw, SendHorizonal, Trash2, TriangleAlert, UserRound } from "lucide-react";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

type Turn = { role: "user" | "assistant"; content: string; warn?: string | null };

async function post<T>(body: unknown): Promise<T & { error?: string }> {
  const r = await fetch("/api/admin/wa/bot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok && !data.error) data.error = `Gagal (HTTP ${r.status}).`;
  return data;
}

/** Uji coba percakapan dengan klon AI seorang admin (tidak mengirim apa pun ke WhatsApp) */
export function BotTestChat({ accountId, adminName }: { accountId: number; adminName: string }) {
  const toast = useToast();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...turns, { role: "user" as const, content: q }];
    setTurns(next);
    setText("");
    setBusy(true);
    requestAnimationFrame(() => list.current?.scrollTo({ top: list.current.scrollHeight }));
    const r = await post<{ reply?: string; answered?: boolean; grounded?: boolean; why?: string | null }>({
      action: "test",
      account: accountId,
      messages: next.map(({ role, content }) => ({ role, content })),
    });
    setBusy(false);
    if (r.error || !r.reply) {
      toast.error(r.error ?? "Klon AI tidak membalas.");
      setTurns(turns);
      setText(q);
      return;
    }
    const warn = !r.answered ? "AI menandai: belum tahu jawabannya → di WhatsApp akan dialihkan ke admin." : !r.grounded ? `Tidak lolos cek fakta (${r.why ?? "-"}) → di WhatsApp jawaban ini TIDAK dikirim.` : null;
    setTurns([...next, { role: "assistant", content: r.reply, warn }]);
    requestAnimationFrame(() => list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" }));
  };

  return (
    <div className="card flex h-[560px] flex-col overflow-hidden p-0!">
      <div className="flex items-center gap-2 border-b border-navy-100 bg-linear-to-r from-violet-50 to-white px-4 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-linear-to-br from-violet-500 to-brand-600 text-white">
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-navy-900">Uji coba · klon AI {adminName}</p>
          <p className="text-[11px] text-navy-400">Berpura-puralah jadi customer. Tidak ada pesan yang dikirim ke WhatsApp.</p>
        </div>
        {turns.length > 0 && (
          <button className="btn-ghost btn-sm" onClick={() => setTurns([])}>
            <RotateCcw className="h-3.5 w-3.5" /> Ulang
          </button>
        )}
      </div>
      <div ref={list} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#efeae2] bg-dots p-4">
        {!turns.length && (
          <div className="grid h-full place-items-center text-center text-sm text-navy-500">
            <div>
              <UserRound className="mx-auto mb-2 h-8 w-8 text-navy-300" />
              Coba tanya seperti customer, mis. <b>&ldquo;kak, COC itu apa ya?&rdquo;</b>
              <br />
              lalu bandingkan dengan cara {adminName} biasanya menjawab.
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={cn("flex", t.role === "assistant" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                t.role === "assistant" ? "rounded-tr-sm bg-linear-to-br from-brand-600 to-navy-700 text-white" : "rounded-tl-sm bg-white text-navy-800",
              )}
            >
              <p className="whitespace-pre-wrap break-words">{t.content}</p>
              {t.warn && (
                <p className="mt-1.5 flex items-start gap-1 rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900">
                  <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" /> {t.warn}
                </p>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <p className="flex justify-end">
            <span className="inline-flex items-center gap-2 rounded-2xl bg-white/90 px-3 py-2 text-xs font-semibold text-navy-500 shadow-sm">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> {adminName} versi AI sedang mengetik…
            </span>
          </p>
        )}
      </div>
      <div className="flex items-end gap-2 border-t border-navy-100 bg-white p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 1000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={Math.min(4, Math.max(1, text.split("\n").length))}
          placeholder="Tulis pesan sebagai customer…"
          className="input max-h-32 min-h-11 resize-none"
          aria-label="Pesan uji coba"
          disabled={busy}
        />
        <button className="btn-primary h-11 w-11 shrink-0 px-0!" onClick={send} disabled={busy || !text.trim()} aria-label="Kirim">
          <SendHorizonal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** Hapus satu ingatan yang keliru / sudah tidak berlaku */
export function ForgetButton({ accountId, memoryId }: { accountId: number; memoryId: number }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn-icon h-7 w-7 shrink-0 text-navy-300 hover:bg-rose-50 hover:text-rose-600"
      disabled={busy}
      title="Lupakan ingatan ini (keliru / sudah tidak berlaku)"
      aria-label="Lupakan ingatan ini"
      onClick={async () => {
        setBusy(true);
        const r = await post({ action: "forget", account: accountId, memoryId });
        setBusy(false);
        if (r.error) return toast.error(r.error);
        toast.success("Ingatan dihapus dari klon AI.");
        router.refresh();
      }}
    >
      {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}

/** Mulai dari nol: hapus semua hasil belajar klon AI */
export function ResetBotButton({ accountId }: { accountId: number }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm("Hapus SEMUA hasil belajar klon AI ini (gaya bahasa, tanya-jawab, info)? Analisis harus diulang dari awal.")) return;
        setBusy(true);
        const r = await post({ action: "reset", account: accountId });
        setBusy(false);
        if (r.error) return toast.error(r.error);
        toast.success("Klon AI dikosongkan. Jalankan Analisis chat untuk belajar ulang.");
        router.refresh();
      }}
    >
      {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Reset klon
    </button>
  );
}
