"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronDown, User as UserIcon } from "lucide-react";
import type { Employee } from "@/lib/api";

export interface EmployeeComboboxProps {
  employees: Employee[];
  value: Employee | null;
  onChange: (emp: Employee) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function EmployeeCombobox({
  employees,
  value,
  onChange,
  autoFocus,
  disabled,
}: EmployeeComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q) ||
        e.employee_code.toLowerCase().includes(q),
    );
  }, [employees, query]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLLIElement>(
      `[data-idx="${active}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const commit = useCallback(
    (emp: Employee) => {
      onChange(emp);
      setQuery("");
      setOpen(false);
      inputRef.current?.blur();
    },
    [onChange],
  );

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      if (open) {
        e.preventDefault();
        setActive(0);
      }
    } else if (e.key === "End") {
      if (open) {
        e.preventDefault();
        setActive(Math.max(filtered.length - 1, 0));
      }
    } else if (e.key === "Enter") {
      if (open && filtered[active]) {
        e.preventDefault();
        commit(filtered[active]);
      }
    } else if (e.key === "Tab") {
      if (open && !e.shiftKey && filtered[active]) {
        e.preventDefault();
        commit(filtered[active]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setQuery("");
      }
    }
  };

  const displayValue = open ? query : value ? `${value.name} · ${value.department}` : query;

  return (
    <div ref={containerRef} className="relative">
      <label
        htmlFor={inputId}
        className="mb-2 block text-sm font-semibold"
        style={{ color: "var(--c-text)" }}
      >
        직원 선택
      </label>
      <div
        className="flex items-center gap-3 rounded-[14px] border px-4 py-3.5 transition-colors focus-within:border-[var(--c-blue)]"
        style={{
          background: "var(--c-s2)",
          borderColor: "var(--c-border)",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <UserIcon size={18} style={{ color: "var(--c-blue)", flexShrink: 0 }} />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-controls={listId}
          aria-expanded={open}
          aria-autocomplete="list"
          aria-activedescendant={
            open && filtered[active] ? `${listId}-opt-${active}` : undefined
          }
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder="직원 이름 또는 부서 검색"
          value={displayValue}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKey}
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--c-muted)]"
          style={{ color: "var(--c-text)" }}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? "직원 목록 닫기" : "직원 목록 열기"}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setOpen((prev) => !prev);
            inputRef.current?.focus();
          }}
          className="no-btn-inset flex shrink-0 items-center justify-center bg-transparent p-0"
          style={{ color: "var(--c-muted)", cursor: disabled ? "default" : "pointer" }}
        >
          <ChevronDown
            size={16}
            style={{
              transition: "transform 0.18s ease",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>
      </div>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-1.5 max-h-64 overflow-y-auto rounded-[14px] border py-1.5"
          style={{
            background: "var(--c-popup-bg)",
            borderColor: "var(--c-border)",
            boxShadow: "var(--c-popup-shadow)",
          }}
        >
          {filtered.length === 0 ? (
            <li
              className="px-4 py-3 text-sm"
              style={{ color: "var(--c-muted)" }}
            >
              검색 결과가 없습니다.
            </li>
          ) : (
            filtered.map((emp, idx) => {
              const isActive = idx === active;
              const isSelected = value?.employee_id === emp.employee_id;
              return (
                <li
                  key={emp.employee_id}
                  id={`${listId}-opt-${idx}`}
                  data-idx={idx}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => commit(emp)}
                  className="flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm transition-colors"
                  style={{
                    background: isActive
                      ? "color-mix(in srgb, var(--c-blue) 10%, transparent)"
                      : "transparent",
                  }}
                >
                  <span style={{ color: "var(--c-text)" }}>{emp.name}</span>
                  <span className="ml-3 text-xs" style={{ color: "var(--c-muted)" }}>
                    {emp.department}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
