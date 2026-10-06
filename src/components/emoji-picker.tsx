"use client";

import { useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { cn } from "@/lib/utils";

/** Pemilih emoji ringan (tanpa library) — emoji Unicode biasa, tampil dengan font emoji sistem & WhatsApp. */

const GROUPS: { label: string; icon: string; list: string }[] = [
  { label: "Sering", icon: "⭐", list: "🙏 😊 👍 🙂 😁 🥰 😍 🤗 ✨ 🎉 💪 🔥 ✅ ❤️ 👋 😅 😂 🤩 🙌 👏" },
  {
    label: "Wajah",
    icon: "😀",
    list: "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠",
  },
  { label: "Gestur", icon: "👍", list: "👍 👎 👌 🤌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👋 🤚 🖐️ ✋ 🖖 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🫶 🫡 🤷 🤦 🙋 🙆 🙅 💁 🧑‍🏫 👨‍🎓 👩‍🎓 🧑‍💻" },
  { label: "Hati", icon: "❤️", list: "❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💖 💗 💓 💞 💕 💘 💝 💟 ❣️ 💯 ✨ ⭐ 🌟 💫 🔥 🎉 🎊 🥳 🎁 🏆 🥇 🥈 🥉 🏅 🎖️" },
  {
    label: "Belajar",
    icon: "📚",
    list: "📚 📖 📝 ✏️ 🖊️ 📒 📓 📔 📕 📗 📘 📙 📐 📏 🧮 🔬 🔭 🧪 🧬 🌍 🗺️ 💡 🎓 🏫 🧠 💻 🖥️ 📱 ⌨️ 🖨️ 📊 📈 📉 📅 🗓️ ⏰ ⏳ ✅ ☑️ ❌ ❓ ❗ ⚠️ 📌 📍 🔔 📣 📢",
  },
  {
    label: "Lainnya",
    icon: "🌈",
    list: "🌈 ☀️ 🌤️ ⛅ 🌧️ ⚡ ❄️ 🌸 🌺 🌻 🌹 🍀 🌱 🌳 🐱 🐶 🐻 🐼 🦁 🐯 🐣 🦋 🍎 🍉 🍓 🍰 🎂 🍫 ☕ 🧋 🍜 🍕 🚀 ✈️ 🚗 🏠 💰 💵 💳 🎵 🎶 ⚽ 🏀 🎮 🎯",
  },
];

export function EmojiPicker({ onPick, disabled, className }: { onPick: (emoji: string) => void; disabled?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={box} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className={cn("btn-icon h-11 w-11", open && "bg-brand-50 text-brand-600")}
        aria-label="Pilih emoji"
        aria-expanded={open}
        title="Emoji"
      >
        <Smile className="h-5 w-5" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Pilih emoji"
          className="absolute bottom-full left-0 z-30 mb-2 w-[min(20rem,calc(100vw-2rem))] animate-scale-in overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-navy-100"
        >
          <div className="flex border-b border-navy-100 bg-navy-50/60">
            {GROUPS.map((g, i) => (
              <button
                key={g.label}
                type="button"
                onClick={() => setTab(i)}
                title={g.label}
                aria-label={g.label}
                className={cn(
                  "flex-1 py-2 text-lg transition",
                  tab === i ? "bg-white shadow-[inset_0_-2px_0] shadow-brand-500" : "opacity-60 hover:opacity-100",
                )}
              >
                {g.icon}
              </button>
            ))}
          </div>
          <p className="px-3 pt-2 text-[11px] font-bold uppercase tracking-wide text-navy-400">{GROUPS[tab].label}</p>
          <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto p-2">
            {GROUPS[tab].list.split(" ").map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onPick(e)}
                className="grid h-9 place-items-center rounded-lg text-xl transition hover:scale-110 hover:bg-brand-50"
                aria-label={`Sisipkan ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
