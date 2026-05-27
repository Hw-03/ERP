"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";

/**
 * 이미지 확대 모달 — backdrop + ESC + 큰 미리보기.
 *
 * 자재 이미지를 클릭하면 화면 가운데에 큰 이미지를 표시. backdrop 클릭/ESC/
 * 우상단 닫기 버튼으로 닫힘. Image 컴포넌트 대신 native <img> 사용 — 큰
 * 원본 이미지 보여주는 용도라 next/image 최적화 불필요.
 */
export function ImageLightbox({
  open,
  src,
  alt,
  onClose,
}: {
  open: boolean;
  src: string | null;
  alt?: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || !mounted || !src) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[460] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,.82)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="이미지 확대 보기"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full border transition-colors hover:brightness-125"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
      >
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? ""}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[90vw] rounded-[18px] object-contain"
        style={{ background: LEGACY_COLORS.s1 }}
      />
    </div>,
    document.body,
  );
}
