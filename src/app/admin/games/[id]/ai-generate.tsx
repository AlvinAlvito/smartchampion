"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { fillExplanationsAction, generateQuestionsAction, saveGeneratedQuestionsAction } from "@/app/actions/ai-games";
import { Spinner } from "@/components/form-buttons";
import { useToast } from "@/components/toast";
import { AiButton, AiQuestionsDialog } from "@/components/ai-questions-dialog";

export type AiGameContext = { id: number; title: string; subject: string; jenjang: string; description: string };

export function AiGenerateButton({ game }: { game: AiGameContext }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AiButton onClick={() => setOpen(true)} />
      {open && (
        <AiQuestionsDialog
          contextTitle="Konteks game (dipakai AI)"
          intro="AI menyusun soal dari judul, mapel, jenjang, dan deskripsi game. Rumus ditulis dengan LaTeX."
          context={[
            ["Judul", game.title],
            ["Mapel · Jenjang", `${game.subject} · ${game.jenjang === "UMUM" ? "Umum" : game.jenjang}`],
            ["Deskripsi", game.description || <i className="font-normal text-navy-400">(kosong, isi lewat Edit game agar soal lebih tepat)</i>],
          ]}
          defaultPoints={100}
          generate={(o) => generateQuestionsAction({ gameId: game.id, ...o })}
          save={(chosen, points) => saveGeneratedQuestionsAction(game.id, chosen, points)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** Buat pembahasan (AI) untuk soal yang belum punya pembahasan */
export function AiExplainButton({ gameId, missing }: { gameId: number; missing: number }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      className="btn-secondary btn-sm"
      disabled={pending}
      title="AI menulis pembahasan untuk soal yang belum punya pembahasan (maks. 15 soal per klik)"
      onClick={() =>
        start(async () => {
          if (toast.fromResult(await fillExplanationsAction(gameId))) router.refresh();
        })
      }
    >
      {pending ? <Spinner /> : <Lightbulb className="h-3.5 w-3.5 text-amber-500" />}
      {pending ? "Menulis pembahasan…" : `Lengkapi pembahasan AI (${missing})`}
    </button>
  );
}
