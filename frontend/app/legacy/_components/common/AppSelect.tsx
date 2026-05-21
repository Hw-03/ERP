"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const rootRef = useRef<HTMLDivElement>(null);
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
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onDocMouseDown);
    return () => window.removeEventListener("mousedown", onDocMouseDown);
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
    el?.scrollIntoView({ block: "nearest" });
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
        aria-label={triggerAriaLabel}
        className={`flex w-full items-center justify-between gap-2 border font-semibold outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:border-[var(--c-blue)] ${SIZE_TRIGGER[size]} ${triggerClassName ?? ""}`}
        style={{
          background: "var(--c-s2)",
          borderColor: open ? "var(--c-blue)" : "var(--c-border)",
          color: isPlaceholder ? "var(--c-muted2)" : "var(--c-text)",
          ...triggerStyle,
        }}
      >
        <span className="truncate text-left">{triggerLabel || " "}</span>
        <ChevronDown
          className={`${SIZE_CHEVRON[size]} shrink-0 transition-transform duration-150`}
          style={{
            color: "var(--c-muted2)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {name && <input type="hidden" name={name} value={value} />}

      {open && (
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
          {options.length === 0 ? (
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
                    commit(idx);
                  }}
                  className="mx-1 flex items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-sm font-bold transition-colors"
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
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className={`${SIZE_CHEVRON[size]} shrink-0`} />}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
