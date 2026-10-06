import type { CatMood } from "@/lib/game-rules";
import { cn } from "@/lib/utils";

/**
 * Maskot kucing kuning untuk games (SVG + animasi CSS `cat-*` di globals.css).
 * 7 ekspresi: netral · senyum · tertawa · girang (lompat) · sedih · berkaca (air mata) · menangis (deras).
 */

const FUR = "#FFD43B";
const FUR_SHADE = "#F7B924";
const LINE = "#B7791F";
const STRIPE = "#F59E0B";
const CREAM = "#FFF7DB";
const PINK = "#FF9EB5";
const INK = "#2B2118";
const TEAR = "#7CC8F2";

function OpenEye({ cx, look = 0, big = false }: { cx: number; look?: number; big?: boolean }) {
  const r = big ? 1.18 : 1;
  return (
    <g className="cat-blink">
      <ellipse cx={cx} cy={60} rx={5.6 * r} ry={7.2 * r} fill={INK} />
      <circle cx={cx + 1.9} cy={57.4 + look} r={2.1 * r} fill="#fff" />
      <circle cx={cx - 1.8} cy={63 + look} r={0.95 * r} fill="#fff" opacity={0.85} />
    </g>
  );
}

/** Mata menyipit bahagia ^ ^ */
const HappyEye = ({ cx }: { cx: number }) => (
  <path d={`M${cx - 7} 62 Q${cx} 52 ${cx + 7} 62`} fill="none" stroke={INK} strokeWidth={3.6} strokeLinecap="round" />
);

/** Mata bintang (girang) */
function StarEye({ cx }: { cx: number }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const r = i % 2 ? 3.4 : 8;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(60 + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return (
    <g className="cat-pulse">
      <polygon points={pts} fill={INK} strokeLinejoin="round" stroke={INK} strokeWidth={1.2} />
      <circle cx={cx + 1.6} cy={57.6} r={1.4} fill="#fff" />
    </g>
  );
}

/** Mata terpejam menangis > < */
const SqueezeEye = ({ cx, dir }: { cx: number; dir: 1 | -1 }) => (
  <path
    d={`M${cx - 6 * dir} 54 L${cx + 5 * dir} 60.5 L${cx - 6 * dir} 66`}
    fill="none"
    stroke={INK}
    strokeWidth={3.4}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

/** Bintang kecil 4 sudut (kilau) */
const Sparkle = ({ x, y, s = 1, color = "#F9D014", delay = 0 }: { x: number; y: number; s?: number; color?: string; delay?: number }) => (
  <path
    className="cat-twinkle"
    style={{ animationDelay: `${delay}s` }}
    d={`M${x} ${y - 6 * s} Q${x + 1.2 * s} ${y - 1.2 * s} ${x + 6 * s} ${y} Q${x + 1.2 * s} ${y + 1.2 * s} ${x} ${y + 6 * s} Q${x - 1.2 * s} ${y + 1.2 * s} ${x - 6 * s} ${y} Q${x - 1.2 * s} ${y - 1.2 * s} ${x} ${y - 6 * s}Z`}
    fill={color}
  />
);

const CONFETTI = [
  { x: 18, c: "#1A6F9F", d: 0 },
  { x: 34, c: "#F9D014", d: 0.5 },
  { x: 126, c: "#34D399", d: 0.2 },
  { x: 144, c: "#FF7AA2", d: 0.75 },
  { x: 8, c: "#FF7AA2", d: 1 },
  { x: 152, c: "#1A6F9F", d: 1.2 },
];

export function GameCat({ mood, className }: { mood: CatMood; className?: string }) {
  const happy = mood === "senyum" || mood === "tertawa" || mood === "girang";
  const sad = mood === "sedih" || mood === "berkaca" || mood === "menangis";
  const bodyAnim = mood === "girang" ? "cat-jump" : mood === "tertawa" ? "cat-bob" : mood === "menangis" ? "cat-sob" : sad ? "cat-droop" : "cat-breathe";

  return (
    <svg viewBox="0 0 160 152" overflow="visible" className={cn("cat select-none", className)} role="img" aria-label={`Maskot kucing: ${mood}`}>
      {/* bayangan lantai */}
      <ellipse
        cx={80}
        cy={147}
        rx={mood === "girang" ? 26 : 36}
        ry={4.5}
        fill="#0b2638"
        opacity={0.12}
        className={mood === "girang" ? "cat-shadow" : undefined}
      />

      {/* konfeti & kilau di luar badan (tidak ikut melompat) */}
      {mood === "girang" &&
        CONFETTI.map((c, i) => (
          <rect key={i} x={c.x} y={10} width={5} height={8} rx={1.5} fill={c.c} className="cat-confetti" style={{ animationDelay: `${c.d}s` }} />
        ))}

      <g className={bodyAnim}>
        {/* ekor */}
        <path
          className={sad ? "cat-tail-slow" : "cat-tail"}
          d={sad ? "M110 128 C134 132 146 124 148 112" : "M110 124 C138 122 150 98 136 72"}
          fill="none"
          stroke={LINE}
          strokeWidth={13}
          strokeLinecap="round"
        />
        <path
          className={sad ? "cat-tail-slow" : "cat-tail"}
          d={sad ? "M110 128 C134 132 146 124 148 112" : "M110 124 C138 122 150 98 136 72"}
          fill="none"
          stroke={FUR}
          strokeWidth={8.5}
          strokeLinecap="round"
        />

        {/* tangan terangkat (girang) — di belakang kepala */}
        {mood === "girang" && (
          <>
            <g className="cat-wave-l">
              <path d="M58 108 Q34 102 18 66" fill="none" stroke={LINE} strokeWidth={17} strokeLinecap="round" />
              <path d="M58 108 Q34 102 18 66" fill="none" stroke={FUR} strokeWidth={12.5} strokeLinecap="round" />
              <path d="M13 63 l1 -4 M18 61 l0.5 -4.5 M23 62 l0 -4" stroke={LINE} strokeWidth={1.3} strokeLinecap="round" />
            </g>
            <g className="cat-wave-r">
              <path d="M102 108 Q126 102 142 66" fill="none" stroke={LINE} strokeWidth={17} strokeLinecap="round" />
              <path d="M102 108 Q126 102 142 66" fill="none" stroke={FUR} strokeWidth={12.5} strokeLinecap="round" />
              <path d="M147 63 l-1 -4 M142 61 l-0.5 -4.5 M137 62 l0 -4" stroke={LINE} strokeWidth={1.3} strokeLinecap="round" />
            </g>
          </>
        )}

        {/* badan */}
        <ellipse cx={80} cy={120} rx={35} ry={25} fill={FUR} stroke={LINE} strokeWidth={2.4} />
        <ellipse cx={80} cy={124} rx={19} ry={15} fill={CREAM} />
        <path d="M58 104 q5 4 2 10 M102 104 q-5 4 -2 10" fill="none" stroke={STRIPE} strokeWidth={3} strokeLinecap="round" />
        {/* kaki */}
        <ellipse cx={63} cy={141} rx={12} ry={7} fill={FUR} stroke={LINE} strokeWidth={2.2} />
        <ellipse cx={97} cy={141} rx={12} ry={7} fill={FUR} stroke={LINE} strokeWidth={2.2} />
        <path d="M59 141 v3 M63 141 v3.5 M67 141 v3 M93 141 v3 M97 141 v3.5 M101 141 v3" stroke={LINE} strokeWidth={1.3} strokeLinecap="round" opacity={0.7} />
        {/* tangan di depan (selain girang) */}
        {mood !== "girang" && (
          <>
            <ellipse cx={60} cy={sad ? 128 : 126} rx={8.5} ry={11} fill={FUR} stroke={LINE} strokeWidth={2.2} />
            <ellipse cx={100} cy={sad ? 128 : 126} rx={8.5} ry={11} fill={FUR} stroke={LINE} strokeWidth={2.2} />
          </>
        )}

        {/* kalung biru + lonceng kuning (warna POSI) */}
        <path d="M50 96 Q80 108 110 96" fill="none" stroke="#1A6F9F" strokeWidth={7} strokeLinecap="round" />
        <g className={happy ? "cat-bell" : undefined}>
          <circle cx={80} cy={106} r={6} fill="#F9D014" stroke={LINE} strokeWidth={1.8} />
          <path d="M75 105 h10" stroke={LINE} strokeWidth={1.3} />
          <circle cx={80} cy={108.5} r={1.3} fill={LINE} />
        </g>

        {/* kepala */}
        <g className={mood === "menangis" ? "cat-head-sob" : happy ? "cat-head-tilt" : undefined}>
          {/* telinga (turun saat sedih) */}
          <g className={sad ? "cat-ear-l-droop" : "cat-ear-l"}>
            <path d="M42 50 L36 16 Q37 11 42 14 L68 34 Z" fill={FUR} stroke={LINE} strokeWidth={2.4} strokeLinejoin="round" />
            <path d="M45 42 L42 22 L59 35 Z" fill={PINK} />
          </g>
          <g className={sad ? "cat-ear-r-droop" : "cat-ear-r"}>
            <path d="M118 50 L124 16 Q123 11 118 14 L92 34 Z" fill={FUR} stroke={LINE} strokeWidth={2.4} strokeLinejoin="round" />
            <path d="M115 42 L118 22 L101 35 Z" fill={PINK} />
          </g>

          <ellipse cx={80} cy={62} rx={45} ry={37} fill={FUR} stroke={LINE} strokeWidth={2.4} />
          {/* bayangan bawah kepala */}
          <path d="M42 74 Q80 104 118 74 Q80 96 42 74Z" fill={FUR_SHADE} opacity={0.45} />
          {/* belang dahi */}
          <path d="M80 27 v10 M70 29 l2.5 8 M90 29 l-2.5 8" stroke={STRIPE} strokeWidth={3.6} strokeLinecap="round" />
          {/* belang pipi */}
          <path d="M37 60 h8 M36 66 h7 M123 60 h-8 M124 66 h-7" stroke={STRIPE} strokeWidth={3} strokeLinecap="round" />

          {/* moncong */}
          <ellipse cx={71} cy={77} rx={11} ry={8.5} fill={CREAM} />
          <ellipse cx={89} cy={77} rx={11} ry={8.5} fill={CREAM} />

          {/* pipi merona */}
          <ellipse cx={50} cy={75} rx={7.5} ry={4.6} fill={PINK} opacity={happy ? 0.8 : 0.5} />
          <ellipse cx={110} cy={75} rx={7.5} ry={4.6} fill={PINK} opacity={happy ? 0.8 : 0.5} />

          {/* kumis */}
          <path d="M44 74 L24 70 M44 79 L23 81 M116 74 L136 70 M116 79 L137 81" stroke={LINE} strokeWidth={1.5} strokeLinecap="round" opacity={0.55} />

          {/* alis sedih */}
          {sad && mood !== "menangis" && <path d="M53 49 L69 44 M107 49 L91 44" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />}

          {/* mata */}
          {mood === "netral" && (
            <>
              <OpenEye cx={63} />
              <OpenEye cx={97} />
            </>
          )}
          {mood === "senyum" && (
            <>
              <OpenEye cx={63} />
              <OpenEye cx={97} />
              {/* kelopak bawah tersenyum */}
              <path d="M56 66 Q63 70 70 66 M90 66 Q97 70 104 66" fill="none" stroke={FUR} strokeWidth={3} strokeLinecap="round" />
            </>
          )}
          {mood === "tertawa" && (
            <>
              <HappyEye cx={63} />
              <HappyEye cx={97} />
            </>
          )}
          {mood === "girang" && (
            <>
              <StarEye cx={63} />
              <StarEye cx={97} />
            </>
          )}
          {mood === "sedih" && (
            <>
              <OpenEye cx={63} look={2} />
              <OpenEye cx={97} look={2} />
            </>
          )}
          {mood === "berkaca" && (
            <>
              <OpenEye cx={63} look={2} big />
              <OpenEye cx={97} look={2} big />
              {/* genangan air mata di kelopak */}
              <path d="M55 66 Q63 71 71 66" fill="none" stroke={TEAR} strokeWidth={2.6} strokeLinecap="round" opacity={0.9} />
              <path d="M89 66 Q97 71 105 66" fill="none" stroke={TEAR} strokeWidth={2.6} strokeLinecap="round" opacity={0.9} />
            </>
          )}
          {mood === "menangis" && (
            <>
              <SqueezeEye cx={63} dir={1} />
              <SqueezeEye cx={97} dir={-1} />
              <path d="M52 47 L68 51 M108 47 L92 51" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
            </>
          )}

          {/* hidung */}
          <path d="M75.5 70 h9 q0.6 0 0.2 0.6 L80.4 75.2 q-0.4 0.4 -0.8 0 L75.3 70.6 q-0.4 -0.6 0.2 -0.6Z" fill="#FF7A9C" />

          {/* mulut */}
          {mood === "netral" && <path d="M73 77.5 Q76.5 81 80 77.5 Q83.5 81 87 77.5" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />}
          {mood === "senyum" && (
            <g>
              <path d="M72 77 Q80 90 88 77 Q80 80 72 77Z" fill="#7A2B33" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
              <path d="M76 83.5 Q80 81 84 83.5 Q80 87.5 76 83.5Z" fill="#FF7A9C" />
            </g>
          )}
          {(mood === "tertawa" || mood === "girang") && (
            <g className="cat-laugh">
              <path d="M68 76 Q80 99 92 76 Q80 80 68 76Z" fill="#7A2B33" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
              <path d="M73.5 87 Q80 83 86.5 87 Q80 94 73.5 87Z" fill="#FF7A9C" />
            </g>
          )}
          {mood === "sedih" && <path d="M73 84 Q80 77.5 87 84" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />}
          {mood === "berkaca" && (
            <path
              d="M72 84 Q75 80.5 78 83.5 Q81 80.5 84 83.5 Q86 81 88 84"
              fill="none"
              stroke={INK}
              strokeWidth={2.1}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="cat-quiver"
            />
          )}
          {mood === "menangis" && (
            <g className="cat-wail">
              <path d="M69 88 Q70 77 80 77 Q90 77 91 88 Q80 92 69 88Z" fill="#7A2B33" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
              <path d="M74 88.5 Q80 84 86 88.5 Q80 91 74 88.5Z" fill="#FF7A9C" />
            </g>
          )}

          {/* air mata */}
          {mood === "berkaca" && (
            <>
              <path className="cat-tear" d="M57 70 q-3 5 0 7 q3 -2 0 -7Z" fill={TEAR} stroke="#4FA9DB" strokeWidth={0.8} />
              <path className="cat-tear" style={{ animationDelay: "1.1s" }} d="M103 70 q-3 5 0 7 q3 -2 0 -7Z" fill={TEAR} stroke="#4FA9DB" strokeWidth={0.8} />
            </>
          )}
          {mood === "menangis" && (
            <>
              {/* aliran air mata deras */}
              <path
                className="cat-stream"
                d="M58 66 Q52 84 54 104"
                fill="none"
                stroke={TEAR}
                strokeWidth={6}
                strokeLinecap="round"
                strokeDasharray="7 5"
                opacity={0.95}
              />
              <path
                className="cat-stream"
                d="M102 66 Q108 84 106 104"
                fill="none"
                stroke={TEAR}
                strokeWidth={6}
                strokeLinecap="round"
                strokeDasharray="7 5"
                opacity={0.95}
              />
              {/* percikan */}
              {[0, 0.35, 0.7].map((d) => (
                <g key={d}>
                  <circle className="cat-spray-l" style={{ animationDelay: `${d}s` }} cx={52} cy={62} r={2.6} fill={TEAR} />
                  <circle className="cat-spray-r" style={{ animationDelay: `${d + 0.17}s` }} cx={108} cy={62} r={2.6} fill={TEAR} />
                </g>
              ))}
            </>
          )}
        </g>
      </g>

      {/* kilau ceria */}
      {(mood === "tertawa" || mood === "girang") && (
        <>
          <Sparkle x={20} y={34} s={1.1} />
          <Sparkle x={142} y={28} s={0.9} color="#1A6F9F" delay={0.4} />
          <Sparkle x={148} y={96} s={0.7} delay={0.8} />
          <Sparkle x={12} y={92} s={0.7} color="#1A6F9F" delay={1.1} />
        </>
      )}
      {mood === "senyum" && <Sparkle x={140} y={34} s={0.8} />}
      {/* awan mendung kecil saat menangis deras */}
      {mood === "menangis" && (
        <g className="cat-cloud" opacity={0.85}>
          <path d="M118 14 a7 7 0 0 1 13 -3 a6 6 0 0 1 11 4 a5 5 0 0 1 -1 10 h-22 a6 6 0 0 1 -1 -11Z" fill="#94A3B8" />
          <path d="M124 28 l-2 5 M131 28 l-2 5 M138 28 l-2 5" stroke={TEAR} strokeWidth={2} strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
