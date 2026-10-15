"use client";

import { useRef, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import clsx from "clsx";
import { Search, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export interface SearchInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  ariaLabel?: string;
  maxLength?: number;
  disabled?: boolean;
  clearAriaLabel?: string;
  clearable?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "defaultValue"> & {
    "data-testid"?: string;
  };
  onKeyDown?: InputHTMLAttributes<HTMLInputElement>["onKeyDown"];
  onFocus?: InputHTMLAttributes<HTMLInputElement>["onFocus"];
  onClick?: InputHTMLAttributes<HTMLInputElement>["onClick"];
}

/** 조합 중 초안과 검색 결과를 함께 갱신하되 Enter 선택은 조합 완료 후 허용한다. */
export function SearchInput({
  value, onChange, placeholder = "검색", className, style, autoFocus, inputRef,
  ariaLabel, maxLength, disabled = false, clearAriaLabel = "검색어 지우기",
  clearable = true, leading, trailing, inputProps, onKeyDown, onFocus, onClick,
}: SearchInputProps) {
  const composingRef = useRef(false);
  const localRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(value);
  const [composing, setComposing] = useState(false);

  return (
    <div
      className={clsx("flex min-h-11 items-center gap-2 rounded-[14px] border px-3 focus-within:ring-2 focus-within:ring-[var(--c-blue)]", className)}
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, ...style }}
    >
      {leading === undefined ? <Search aria-hidden size={16} color={LEGACY_COLORS.muted} className="shrink-0" /> : leading}
      <input
        inputMode="search"
        enterKeyHint="search"
        {...inputProps}
        ref={(node) => {
          localRef.current = node;
          if (typeof inputRef === "function") return inputRef(node);
          if (inputRef) inputRef.current = node;
        }}
        aria-label={ariaLabel ?? inputProps?.["aria-label"] ?? (inputProps?.id ? undefined : placeholder)}
        maxLength={maxLength ?? inputProps?.maxLength}
        disabled={disabled || inputProps?.disabled}
        autoFocus={autoFocus ?? inputProps?.autoFocus}
        placeholder={placeholder}
        value={composing ? draft : value}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          onChange(next);
        }}
        onCompositionStart={(event) => {
          composingRef.current = true;
          setDraft(event.currentTarget.value);
          setComposing(true);
          inputProps?.onCompositionStart?.(event);
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          setComposing(false);
          const next = event.currentTarget.value;
          setDraft(next);
          onChange(next);
          inputProps?.onCompositionEnd?.(event);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229)) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          (onKeyDown ?? inputProps?.onKeyDown)?.(event);
        }}
        onFocus={onFocus ?? inputProps?.onFocus}
        onClick={onClick ?? inputProps?.onClick}
        className={clsx("h-11 min-w-0 flex-1 bg-transparent text-sm font-medium outline-none", inputProps?.className)}
        style={{ color: LEGACY_COLORS.text, ...inputProps?.style }}
      />
      {clearable && (composing ? draft : value) && (
        <button
          type="button"
          disabled={disabled || inputProps?.disabled}
          aria-label={clearAriaLabel}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)]"
          style={{ color: LEGACY_COLORS.muted2 }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            composingRef.current = false;
            setComposing(false);
            setDraft("");
            onChange("");
            localRef.current?.focus();
          }}
        >
          <X aria-hidden size={16} />
        </button>
      )}
      {trailing}
    </div>
  );
}
