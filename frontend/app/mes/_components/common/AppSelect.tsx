"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface AppSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface AppSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  triggerClassName?: string;
  triggerStyle?: React.CSSProperties;
  triggerAriaLabel?: string;
  name?: string;
  mobileSheet?: boolean;
  sheetTitle?: string;
}

const SIZE_TRIGGER: Record<NonNullable<AppSelectProps["size"]>, string> = {
  sm: "rounded-[10px] px-2 py-1.5 text-xs",
  md: "rounded-[14px] px-3 py-2 text-sm",
  lg: "rounded-[18px] px-4 py-3 text-base",
};

const SIZE_CHEVRON: Record<NonNullable<AppSelectProps["size"]>, string> = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
  lg: "h-4 w-4",
};

function firstEnabledIndex(opts: AppSelectOption[]): number {
  for (let i = 0; i < opts.length; i++) if (!opts[i].disabled) return i;
  return -1;
}

function lastEnabledIndex(opts: AppSelectOption[]): number {
  for (let i = opts.length - 1; i >= 0; i--) if (!opts[i].disabled) return i;
  return -1;
}

function nextEnabledIndex(opts: AppSelectOption[], from: number, dir: 1 | -1): number {
  if (opts.length === 0) return -1;
  let i = from < 0 ? (dir === 1 ? -1 : opts.length) : from;
  for (let step = 0; step < opts.length; step++) {
    i = (i + dir + opts.length) % opts.length;
    if (!opts[i].disabled) return i;
  }
  return from;
}

export function AppSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  size = "md",
  className,
  triggerClassName,
  triggerStyle,
  triggerAriaLabel,
  name,
  mobileSheet = false,
  sheetTitle,
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [useMobileSheet, setUseMobileSheet] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const reactId = useId();
  const listId = `app-select-list-${reactId}`;

  const selectedIndex = useMemo(
    () => options.findIndex((o) => o.value === value),
    [options, value],
  );
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !sheetRef.current?.contains(target) &&
        !listRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onDocMouseDown);
    return () => window.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  useEffect(() => {
    if (!mobileSheet) {
      setUseMobileSheet(false);
      return;
    }
    function syncViewport() {
      setUseMobileSheet(window.innerWidth <= 767);
    }
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, [mobileSheet]);

  useEffect(() => {
    if (!open) return;
    function onWindowKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options));
    } else {
      setActiveIndex(-1);
    }
  }, [open, selectedIndex, options]);

  useEffect(() => {
    if (!open || activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLLIElement>(
      `[data-idx="${activeIndex}"]`,
    );
    if (typeof el?.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, open]);

  const commit = useCallback(
    (idx: number) => {
      const opt = options[idx];
      if (!opt || opt.disabled) return;
      onChange(opt.value);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [options, onChange],
  );

  const handleKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Enter" ||
        e.key === " "
      ) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((idx) => nextEnabledIndex(options, idx, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((idx) => nextEnabledIndex(options, idx, -1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(firstEnabledIndex(options));
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(lastEnabledIndex(options));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (activeIndex >= 0) commit(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const triggerLabel = selected?.label ?? placeholder ?? "";
  const isPlaceholder = !selected && !!placeholder;
  const accessibleLabel = triggerAriaLabel ?? sheetTitle;

  const renderOptionItems = (commitOnMouseDown: boolean) => options.length === 0 ? (
    <li className="px-3 py-2 text-xs" style={{ color: "var(--c-muted2)" }}>
      옵션 없음
    </li>
  ) : (
    options.map((opt, idx) => {
      const isSelected = idx === selectedIndex;
      const isActive = idx === activeIndex;
      return (
        <li
          key={opt.value}
          id={`${listId}-opt-${idx}`}
          data-idx={idx}
          role="option"
          aria-selected={isSelected}
          aria-disabled={opt.disabled || undefined}
          onMouseEnter={() => !opt.disabled && setActiveIndex(idx)}
          onMouseDown={(e) => {
            e.preventDefault();
            if (commitOnMouseDown) commit(idx);
          }}
          onClick={(e) => {
            e.preventDefault();
            if (!commitOnMouseDown) commit(idx);
          }}
          className="mx-1 flex min-h-11 items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-sm font-bold transition-colors"
          style={{
            background: opt.disabled
              ? "transparent"
              : isActive
                ? "color-mix(in srgb, var(--c-blue) 10%, transparent)"
                : isSelected
                  ? "color-mix(in srgb, var(--c-blue) 14%, transparent)"
                  : "transparent",
            color: opt.disabled
              ? "var(--c-muted2)"
              : isSelected
                ? "var(--c-blue)"
                : "var(--c-text)",
            cursor: opt.disabled ? "not-allowed" : "pointer",
          }}
        >
          <span className="min-w-0 flex-1 break-words">{opt.label}</span>
          {isSelected && <Check className={`${SIZE_CHEVRON[size]} shrink-0`} />}
        </li>
      );
    })
  );

  const sheetListbox = open && useMobileSheet && typeof document !== "undefined"
    ? createPortal(
      <div
        data-testid="app-select-mobile-sheet"
        className="fixed inset-0 z-[260] flex items-end px-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]"
      >
        <button
          type="button"
          aria-label="선택 닫기"
          className="absolute inset-0 cursor-default"
          style={{ background: "color-mix(in srgb, var(--c-text) 22%, transparent)" }}
          onClick={() => setOpen(false)}
        />
        <div
          ref={sheetRef}
          className="relative z-[1] w-full rounded-[24px] border p-3"
          style={{
            background: "var(--c-popup-bg)",
            borderColor: "var(--c-border)",
            boxShadow: "var(--c-popup-shadow)",
          }}
        >
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full" style={{ background: "var(--c-border-strong)" }} />
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <h3 className="text-sm font-black" style={{ color: "var(--c-text)" }}>
              {sheetTitle ?? "선택"}
            </h3>
            <button
              type="button"
              className="min-h-11 rounded-[12px] px-3 text-sm font-bold"
              style={{ color: "var(--c-blue)" }}
              onClick={() => setOpen(false)}
            >
              닫기
            </button>
          </div>
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-activedescendant={
              activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined
            }
            className="scrollbar-hide max-h-[min(62dvh,420px)] overflow-y-auto rounded-[16px] border py-1.5"
            style={{
              background: "var(--c-s2)",
              borderColor: "var(--c-border)",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {renderOptionItems(false)}
          </ul>
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={handleKey}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-disabled={disabled || undefined}
        aria-label={accessibleLabel}
        className={`flex w-full items-center justify-between gap-2 border font-semibold outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:border-[var(--c-blue)] ${SIZE_TRIGGER[size]} ${triggerClassName ?? ""}`}
        style={{
          background: "var(--c-s2)",
          borderColor: open ? "var(--c-blue)" : "var(--c-border)",
          color: isPlaceholder ? "var(--c-muted2)" : "var(--c-text)",
          ...triggerStyle,
        }}
      >
        <span className="truncate text-left">{triggerLabel || " "}</span>
        <ChevronDown
          className={`${SIZE_CHEVRON[size]} shrink-0 transition-transform duration-150`}
          style={{
            color: "var(--c-muted2)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {name && <input type="hidden" name={name} value={value} />}

      {sheetListbox}

      {open && !useMobileSheet && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined
          }
          className="scrollbar-hide absolute left-0 right-0 z-30 mt-1.5 max-h-[min(80vh,720px)] overflow-y-auto rounded-[14px] border py-1.5"
          style={{
            background: "var(--c-popup-bg)",
            borderColor: "var(--c-border)",
            boxShadow: "var(--c-popup-shadow)",
          }}
        >
          {renderOptionItems(true)}
        </ul>
      )}
    </div>
  );
}
