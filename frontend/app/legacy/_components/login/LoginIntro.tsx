"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

interface LoginIntroProps {
  onSkip: () => void;
  onDone: () => void;
}

const LETTERS = [
  { src: "/images/login/letter_D.png", w: 40, h: 37, alt: "D" },
  { src: "/images/login/letter_E.png", w: 45, h: 38, alt: "E" },
  { src: "/images/login/letter_X.png", w: 42, h: 38, alt: "X" },
  { src: "/images/login/letter_C.png", w: 46, h: 38, alt: "C" },
  { src: "/images/login/letter_O.png", w: 50, h: 38, alt: "O" },
  { src: "/images/login/letter_W.png", w: 53, h: 38, alt: "W" },
  { src: "/images/login/letter_I.png", w: 15, h: 38, alt: "I" },
  { src: "/images/login/letter_N.png", w: 36, h: 38, alt: "N" },
] as const;

type Phase = "logo-in" | "hold" | "shrink";

export function LoginIntro({ onSkip, onDone }: LoginIntroProps) {
  const [phase, setPhase] = useState<Phase>("logo-in");
  const [isMobile, setIsMobile] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  useEffect(() => {
    setIsMobile(window.innerWidth < 640);

    const t1 = setTimeout(() => setPhase("hold"), 1000);
    const t2 = setTimeout(() => setPhase("shrink"), 2200);
    const t3 = setTimeout(() => {
      clearTimers();
      onDone();
    }, 3300);
    timersRef.current = [t1, t2, t3];
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSkip = () => {
    clearTimers();
    onSkip();
  };

  useEffect(() => {
    const onAnyKey = () => {
      clearTimers();
      onSkip();
    };
    window.addEventListener("keydown", onAnyKey);
    window.addEventListener("pointerdown", onAnyKey);
    return () => {
      window.removeEventListener("keydown", onAnyKey);
      window.removeEventListener("pointerdown", onAnyKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isShrink = phase === "shrink";
  const introScale = isMobile ? 1.0 : 1.6;
  const shrinkScale = isMobile ? 0.45 : 0.5;
  const shrinkY = isMobile ? "-58vh" : "-76vh";

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: "var(--c-bg)" }}>
      {/* SKIP 버튼 */}
      <button
        onClick={handleSkip}
        className="absolute right-6 top-5 flex items-center gap-1 rounded border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors hover:border-[var(--c-blue)] hover:text-[var(--c-blue)]"
        style={{ borderColor: "var(--c-border-strong)", color: "var(--c-muted)" }}
      >
        SKIP <ChevronRight size={10} />
      </button>

      {/* 로고 래퍼 */}
      <div
        style={{
          transform: isShrink
            ? `scale(${shrinkScale}) translateY(${shrinkY})`
            : `scale(${introScale}) translateY(0)`,
          transition: isShrink
            ? "transform 1.1s cubic-bezier(0.4, 0, 0.2, 1), opacity 1.1s"
            : "none",
          opacity: isShrink ? 0.7 : 1,
          transformOrigin: "center center",
        }}
      >
        {/* 8개 letter + ® */}
        <div className="flex items-end" style={{ gap: 0 }}>
          {LETTERS.map((letter, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={letter.alt}
              src={letter.src}
              alt={letter.alt}
              width={letter.w}
              height={letter.h}
              draggable={false}
              className="erp-letter block"
              style={{
                width: letter.w,
                height: letter.h,
                objectFit: "contain",
                opacity: 0,
                animation: "erp-letter-in 0.4s ease forwards",
                animationDelay: `${i * 0.08}s`,
                userSelect: "none",
              }}
            />
          ))}
          {/* ® 기호 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/login/registered.png"
            alt="registered"
            width={12}
            height={12}
            draggable={false}
            className="erp-letter mb-auto ml-0.5 block"
            style={{
              width: 12,
              height: 12,
              objectFit: "contain",
              opacity: 0,
              animation: "erp-letter-in 0.35s ease forwards",
              animationDelay: "0.64s",
              userSelect: "none",
            }}
          />
        </div>
      </div>

      {/* 하단 상태 표시 */}
      <div
        className="absolute bottom-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em]"
        style={{ color: "var(--c-muted)" }}
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--c-green)", opacity: 0.8 }}
        />
        SYSTEM INITIALIZING
      </div>
    </div>
  );
}
