"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Search, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

/**
 * 한글 IME 안정화: composition 중에는 외부 onChange 를 호출하지 않고
 * compositionend 에서 한 번만 보내 입력 글자마다 부모 리렌더로 input 이 잘리는 문제 방지.
 * 외부 value 변경은 composition 중일 때만 무시(외부 리셋이 입력을 덮어쓰는 것 방지),
 * 평소에는 즉시 반영.
 */
export function InlineSearch({
  value,
  onChange,
  placeholder = "검색",
  className,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const composingRef = useRef(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (composingRef.current) return;
    if (draft !== value) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draft 동기화는 외부 value 변경 시만
  }, [value]);

  const handleChange = (next: string) => {
    setDraft(next);
    if (!composingRef.current) onChange(next);
  };

  return (
    <div
      className={clsx(
        "flex items-center gap-2 rounded-[14px] border px-3",
        className,
      )}
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <Search size={16} color={LEGACY_COLORS.muted} strokeWidth={2} />
      <input
        autoFocus={autoFocus}
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          const next = (e.target as HTMLInputElement).value;
          setDraft(next);
          onChange(next);
        }}
        placeholder={placeholder}
        className={clsx("h-10 min-w-0 flex-1 bg-transparent outline-none", TYPO.body)}
        style={{ color: LEGACY_COLORS.text }}
      />
      {draft ? (
        <button
          type="button"
          onClick={() => {
            composingRef.current = false;
            setDraft("");
            onChange("");
          }}
          aria-label="검색어 지우기"
          className="shrink-0 rounded-full p-1"
          style={{ color: LEGACY_COLORS.muted }}
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}
