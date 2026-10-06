import { ImageResponse } from "next/og";
import { BrandMark } from "./brand-mark";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Ikon situs (juga dipakai sebagai logo di data terstruktur Google) */
export default function Icon() {
  return new ImageResponse(<BrandMark size={512} />, size);
}
