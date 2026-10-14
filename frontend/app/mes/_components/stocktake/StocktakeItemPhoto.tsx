"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageLightbox } from "@/lib/ui/ImageLightbox";

/** Reuse the dashboard's static image mapping and enlarged image viewer. */
export function StocktakeItemPhoto({ filename, name, size = "small" }: { filename?: string; name: string; size?: "small" | "thumbnail" | "panel" }) {
  const [open, setOpen] = useState(false);
  if (!filename) return null;
  const src = `/images/items/${filename}`;
  const dimension = size === "panel" ? 160 : size === "thumbnail" ? 48 : 56;
  return <>
    <button type="button" aria-label={`${name} 사진 확대`} onClick={event => { event.stopPropagation(); setOpen(true); }} onKeyDown={event => event.stopPropagation()}
      className={`no-btn-inset shrink-0 border border-[var(--c-border)] bg-[var(--c-s2)] transition-transform hover:scale-[1.02] ${size === "panel" ? "rounded-[14px]" : size === "thumbnail" ? "inline-block rounded" : "flex h-[72px] w-[72px] items-center justify-center rounded-[14px] p-2"}`}>
      <Image src={src} alt="" width={dimension} height={dimension} unoptimized className="block rounded object-contain" />
    </button>
    <ImageLightbox open={open} src={src} alt={name} onClose={() => setOpen(false)} />
  </>;
}
