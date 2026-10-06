import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

/** Font PDF (assets/fonts, ikut ter-copy ke build standalone). Bila file tidak ada, jatuh ke font bawaan PDF. */
const DIR = path.join(process.cwd(), "assets", "fonts");
const exists = (f: string) => fs.existsSync(path.join(DIR, f));

export const SANS = exists("PlusJakartaSans-400.ttf") ? "Jakarta" : "Helvetica";
export const SCRIPT = exists("GreatVibes-Regular.ttf") ? "GreatVibes" : "Times-Italic";
export const SERIF = exists("DMSerifDisplay-Regular.ttf") ? "DMSerif" : "Times-Bold";

let done = false;
export function registerFonts() {
  if (done) return;
  done = true;
  if (SANS === "Jakarta") Font.register({ family: "Jakarta", fonts: [400, 600, 700, 800].map((w) => ({ src: path.join(DIR, `PlusJakartaSans-${w}.ttf`), fontWeight: w })) });
  if (SCRIPT === "GreatVibes") Font.register({ family: "GreatVibes", src: path.join(DIR, "GreatVibes-Regular.ttf") });
  if (SERIF === "DMSerif") Font.register({ family: "DMSerif", src: path.join(DIR, "DMSerifDisplay-Regular.ttf") });
  Font.registerHyphenationCallback((word) => [word]);
}
