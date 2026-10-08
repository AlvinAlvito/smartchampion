/** Kenali link video YouTube / Google Drive → URL embed (pemutar) & thumbnail (pratinjau). */
export type VideoInfo = { kind: "youtube" | "drive"; id: string; embed: string; thumb: string; watch: string };

export function videoInfo(url: string | null | undefined): VideoInfo | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");

  let yt: string | null = null;
  if (host === "youtu.be") yt = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    yt = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1] ?? null;
  }
  if (yt && /^[\w-]{6,20}$/.test(yt)) {
    return {
      kind: "youtube",
      id: yt,
      embed: `https://www.youtube-nocookie.com/embed/${yt}?rel=0&modestbranding=1`,
      thumb: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
      watch: `https://www.youtube.com/watch?v=${yt}`,
    };
  }

  if (host === "drive.google.com") {
    const id = u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? u.searchParams.get("id");
    if (id && /^[\w-]{10,}$/.test(id)) {
      return {
        kind: "drive",
        id,
        embed: `https://drive.google.com/file/d/${id}/preview`,
        thumb: `https://drive.google.com/thumbnail?id=${id}&sz=w800`,
        watch: `https://drive.google.com/file/d/${id}/view`,
      };
    }
  }
  return null;
}
