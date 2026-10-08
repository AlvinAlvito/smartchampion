"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { deleteGuideAction, moveGuideAction } from "@/app/actions/guides";
import { ConfirmButton } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useReadOnly } from "@/components/read-only";

export function GuideRowActions({ id, title, slug, first, last }: { id: number; title: string; slug: string; first: boolean; last: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const locked = useReadOnly();
  const move = (d: -1 | 1) =>
    start(async () => {
      if (toast.fromResult(await moveGuideAction(id, d))) router.refresh();
    });
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button className="btn-icon h-9 w-9" disabled={locked || pending || first} onClick={() => move(-1)} aria-label={`Naikkan ${title}`}>
        <ArrowUp className="h-4 w-4" />
      </button>
      <button className="btn-icon h-9 w-9" disabled={locked || pending || last} onClick={() => move(1)} aria-label={`Turunkan ${title}`}>
        <ArrowDown className="h-4 w-4" />
      </button>
      <a href={`/panduan/${slug}`} target="_blank" rel="noreferrer" className="btn-icon h-9 w-9" aria-label={`Lihat ${title}`}>
        <ExternalLink className="h-4 w-4" />
      </a>
      <Link href={`/admin/panduan/${id}`} className="btn-icon h-9 w-9" aria-label={`Edit ${title}`}>
        <Pencil className="h-4 w-4" />
      </Link>
      <ConfirmButton
        className="btn-icon h-9 w-9 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
        title="Hapus panduan?"
        message={
          <>
            Panduan <b>{title}</b> beserta langkah & gambarnya akan dihapus.
          </>
        }
        action={() => deleteGuideAction(id)}
        ariaLabel={`Hapus ${title}`}
      >
        <Trash2 className="h-4 w-4" />
      </ConfirmButton>
    </div>
  );
}
