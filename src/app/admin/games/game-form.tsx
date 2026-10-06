"use client";

import { useState } from "react";
import { Gamepad2, Pencil, Plus, Save } from "lucide-react";
import { saveGameAction } from "@/app/actions/games-admin";
import { JENJANG_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/modal";
import { Field } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/form-buttons";

export type GameValues = {
  id: number;
  title: string;
  slug: string;
  description: string;
  subject: string;
  jenjang: string;
  emoji: string;
  secondsPerQuestion: number;
};

const EMOJIS = ["🎯", "⚡", "🔬", "🪐", "📚", "🧩", "🧠", "🏆", "🧮", "🌍", "💡", "🚀"];

function GameDialog({ game, onClose }: { game: GameValues | null; onClose: () => void }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(saveGameAction, { onSuccess: onClose });
  const [emoji, setEmoji] = useState(game?.emoji ?? "🎯");
  const g = game;
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={Gamepad2}
      title={g ? "Edit game" : "Game baru"}
      description={g ? g.title : "Setelah dibuat, tambahkan soal lalu rilis."}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form="game-form" pending={pending}>
            <Save className="h-4 w-4" /> {g ? "Simpan" : "Buat game"}
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id="game-form" className="grid gap-4 sm:grid-cols-2">
        {g && <input type="hidden" name="id" value={g.id} />}
        <input type="hidden" name="emoji" value={emoji} />
        <div className="sm:col-span-2">
          <span className="label">Ikon</span>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((e) => (
              <button
                type="button"
                key={e}
                onClick={() => setEmoji(e)}
                className={cn(
                  "grid h-11 w-11 place-items-center rounded-2xl text-2xl transition hover:scale-110",
                  emoji === e ? "bg-linear-to-br from-brand-500 to-navy-700 shadow-lg ring-2 ring-brand-200" : "bg-navy-50",
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <Field label="Judul *" htmlFor="title" errors={fe?.title} className="sm:col-span-2">
          <input id="title" name="title" defaultValue={g?.title} className="input" />
        </Field>
        <Field label="Mapel" htmlFor="subject">
          <input id="subject" name="subject" defaultValue={g?.subject ?? "Matematika"} className="input" />
        </Field>
        <Field label="Jenjang" htmlFor="jenjang">
          <select id="jenjang" name="jenjang" defaultValue={g?.jenjang ?? "UMUM"} className="input">
            {Object.entries(JENJANG_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Detik per soal" htmlFor="secondsPerQuestion">
          <input id="secondsPerQuestion" name="secondsPerQuestion" type="number" min={5} max={120} defaultValue={g?.secondsPerQuestion ?? 20} className="input" />
        </Field>
        <Field label="Slug URL" htmlFor="slug" hint="Kosongkan agar otomatis.">
          <input id="slug" name="slug" defaultValue={g?.slug} className="input" />
        </Field>
        <Field label="Deskripsi" htmlFor="description" className="sm:col-span-2">
          <textarea id="description" name="description" rows={3} defaultValue={g?.description} className="input" />
        </Field>
      </form>
    </Modal>
  );
}

export function GameDialogButton({ game, className }: { game: GameValues | null; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={className ?? (game ? "btn-secondary" : "btn-primary")}>
        {game ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {game ? "Edit game" : "Game baru"}
      </button>
      {open && <GameDialog game={game} onClose={() => setOpen(false)} />}
    </>
  );
}
