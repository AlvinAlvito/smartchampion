"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Bot, Headset, MessageCircle, RotateCcw, SendHorizontal, Sparkles, X } from "lucide-react";
import { ADMIN_CONTACTS, BOT_GREETING, BOT_NAME, BOT_SUGGESTIONS, CHAT_LIMITS } from "@/lib/chatbot-config";
import { cn } from "@/lib/utils";
import { ChatText } from "./chat-text";

type Msg = { id: string; role: "user" | "assistant"; content: string; handoff?: boolean; local?: boolean };
type Saved = { conversationId?: string; messages: Msg[] };

const uid = () => Math.random().toString(36).slice(2, 10);

function load(key: string | null): Saved {
  if (!key) return { messages: [] };
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Saved) : { messages: [] };
  } catch {
    return { messages: [] };
  }
}

function BotAvatar() {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-linear-to-br from-brand-100 to-sun-100 text-brand-600">
      <Sparkles className="h-4 w-4" />
    </span>
  );
}

function ContactCard() {
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {ADMIN_CONTACTS.map((c) => (
        <a
          key={c.phone}
          href={c.url}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-3 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-500/25 transition hover:bg-emerald-600"
        >
          <MessageCircle className="h-4 w-4" /> Chat {c.name}
        </a>
      ))}
    </div>
  );
}

/**
 * Panel percakapan chatbot. `storageKey` = simpan percakapan di sessionStorage (widget publik);
 * null = tidak disimpan (mis. panel uji di halaman admin).
 */
export function ChatPanel({ onClose, storageKey, page, className }: { onClose?: () => void; storageKey: string | null; page?: string; className?: string }) {
  const [state, setState] = useState<Saved>(() => load(storageKey));
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { messages } = state;
  const started = messages.some((m) => m.role === "user");

  useEffect(() => {
    if (!storageKey) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* penyimpanan tidak tersedia (mode privat) — abaikan */
    }
  }, [state, storageKey]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const push = (m: Msg) => setState((s) => ({ ...s, messages: [...s.messages, m] }));

  const send = async (text: string) => {
    const message = text.trim().slice(0, CHAT_LIMITS.messageChars);
    if (!message || pending) return;
    setInput("");
    push({ id: uid(), role: "user", content: message });
    setPending(true);
    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: state.conversationId, message, page: page ?? location.pathname }),
      });
      const data = (await res.json()) as { conversationId?: string; reply?: string; handoff?: boolean; error?: string };
      if (!res.ok || !data.reply) throw new Error(data.error ?? "gagal");
      setState((s) => ({
        conversationId: data.conversationId ?? s.conversationId,
        messages: [...s.messages, { id: uid(), role: "assistant", content: data.reply!, handoff: data.handoff }],
      }));
    } catch {
      push({ id: uid(), role: "assistant", content: "Maaf Kak, koneksi ke asisten sedang bermasalah. Coba lagi sebentar, atau langsung chat admin kami ya 🙏", handoff: true, local: true });
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  };

  const contactAdmin = () =>
    push({ id: uid(), role: "assistant", content: "Tentu Kak! Admin kami siap membantu lewat WhatsApp (Senin–Sabtu, 08.00–20.00 WIB). Silakan pilih:", handoff: true, local: true });

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl ring-1 ring-navy-100", className)}>
      {/* Header */}
      <div className="relative flex items-center gap-3 bg-linear-to-r from-brand-700 via-brand-600 to-brand-500 px-4 py-3.5 text-white">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
        <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25">
          <Bot className="h-6 w-6" />
        </span>
        <div className="relative min-w-0 flex-1">
          <p className="truncate font-extrabold leading-tight">{BOT_NAME}</p>
          <p className="flex items-center gap-1.5 text-xs text-brand-100">
            <span className="h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/30" /> Asisten AI · Pelatihan POSI
          </p>
        </div>
        {started && (
          <button
            onClick={() => setState({ messages: [] })}
            className="relative grid h-9 w-9 place-items-center rounded-xl bg-white/10 transition hover:bg-white/20"
            aria-label="Mulai percakapan baru"
            title="Mulai percakapan baru"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
        {onClose && (
          <button onClick={onClose} className="relative grid h-9 w-9 place-items-center rounded-xl bg-white/15 transition hover:bg-white/25" aria-label="Tutup chat">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Percakapan */}
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto overscroll-contain bg-linear-to-b from-brand-50/40 to-white px-4 py-4">
        <div className="flex items-end gap-2">
          <BotAvatar />
          <div className="max-w-[85%] rounded-3xl rounded-bl-md bg-white px-4 py-3 text-sm leading-relaxed text-navy-800 shadow-sm ring-1 ring-navy-100">
            <ChatText text={BOT_GREETING} />
          </div>
        </div>
        {!started && (
          <div className="flex flex-wrap gap-2 pl-10">
            {BOT_SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-2xl bg-white px-3 py-2 text-xs font-bold text-brand-700 shadow-sm ring-1 ring-brand-100 transition hover:bg-brand-50 hover:ring-brand-300"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap wrap-break-word rounded-3xl rounded-br-md bg-linear-to-br from-brand-500 to-brand-700 px-4 py-2.5 text-sm text-white shadow-md shadow-brand-500/20">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex items-end gap-2">
              <BotAvatar />
              <div className="max-w-[85%] min-w-0 animate-fade-in rounded-3xl rounded-bl-md bg-white px-4 py-3 text-sm leading-relaxed text-navy-800 shadow-sm ring-1 ring-navy-100">
                <ChatText text={m.content} />
                {m.handoff && <ContactCard />}
              </div>
            </div>
          ),
        )}

        {pending && (
          <div className="flex items-end gap-2" aria-live="polite" aria-label={`${BOT_NAME} sedang mengetik`}>
            <BotAvatar />
            <div className="flex gap-1 rounded-3xl rounded-bl-md bg-white px-4 py-3.5 shadow-sm ring-1 ring-navy-100">
              {[0, 150, 300].map((d) => (
                <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-brand-400" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Aksi cepat + input */}
      <div className="border-t border-navy-50 bg-white px-3 pb-3 pt-2.5">
        <div className="mb-2 flex gap-2 overflow-x-auto">
          <Link href="/kelas" onClick={onClose} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700 transition hover:bg-brand-100">
            <BookOpen className="h-4 w-4" /> Lihat kelas
          </Link>
          <button onClick={contactAdmin} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100">
            <Headset className="h-4 w-4" /> Chat admin
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={CHAT_LIMITS.messageChars}
            placeholder="Tulis pertanyaanmu…"
            className="min-w-0 flex-1 rounded-2xl border border-navy-100 bg-navy-50/40 px-4 py-3 text-base outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100 sm:text-sm"
            aria-label="Pesan"
          />
          <button
            type="submit"
            disabled={!input.trim() || pending}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/30 transition hover:brightness-110 disabled:opacity-50"
            aria-label="Kirim"
          >
            <SendHorizontal className="h-5 w-5" />
          </button>
        </form>
        <p className="mt-2 text-center text-[10.5px] text-navy-400">Kamu sedang chat dengan asisten AI. Jawaban bisa keliru — untuk kepastian, hubungi admin.</p>
      </div>
    </div>
  );
}
