import type { JobCategoryKey, JobPriorityKey } from "@/lib/jobdesk-shared";

/** Data Jobdesk yang dikirim ke client (tanggal sebagai string YYYY-MM-DD / ISO) */

export type RootNote = { rootNote: string | null; rootNoteBy: string | null; rootNoteAt: string | null };

export type DailyItem = RootNote & {
  id: number;
  date: string;
  title: string;
  notes: string | null;
  priority: JobPriorityKey;
  dueTime: string | null;
  weeklyId: number | null;
  routineId: number | null;
  done: boolean;
};

export type WeeklyItem = RootNote & {
  id: number;
  category: JobCategoryKey;
  title: string;
  objective: string | null;
  doneMeasure: string | null;
  leadMeasure: string | null;
  pic: string | null;
  startDate: string | null;
  dueDate: string | null;
  ld1: string | null;
  ld2: string | null;
  ld3: string | null;
  ld1Ok: boolean;
  ld2Ok: boolean;
  ld3Ok: boolean;
  steps: string | null;
  beneficiaries: string | null;
  opsStatus: string | null;
  opsReason: string | null;
  opsHandling: string | null;
  done: boolean;
  doneAt: string | null;
};

export type WeekSheet = {
  roleTitle: string | null;
  focus: string | null;
  context: string | null;
  conclusion: string | null;
  reviewNote: string | null;
  reviewNoteBy: string | null;
  reviewNoteAt: string | null;
};

export type RoutineItem = {
  id: number;
  title: string;
  notes: string | null;
  priority: JobPriorityKey;
  dueTime: string | null;
  weekdays: number[];
  isActive: boolean;
};

export type NoteItem = {
  id: number;
  content: string;
  date: string | null;
  pinned: boolean;
  createdAt: string;
  authorName: string;
  authorRole: string;
  mine: boolean;
};

export type JobCtx = {
  ownerId: number;
  ownerName: string;
  /** "Admin Pelatihan" / "Admin SmartChampion" */
  roleTitle: string;
  /** jobdesk operasional (Admin SmartChampion) */
  ops: boolean;
  year: number;
  week: number;
  dates: string[];
  today: string;
  /** jam sekarang WIB "HH:MM" (dari server) */
  nowTime: string;
  canEdit: boolean;
  canReview: boolean;
  isRoot: boolean;
  viewerId: number;
};
