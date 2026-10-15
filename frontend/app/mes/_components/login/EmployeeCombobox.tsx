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
import { toChosung, toHangul, toQwerty } from "@/lib/hangul";
import { matchesSearchFields, normalizeSearchText } from "@/lib/searchText";
import { SearchInput } from "../common/SearchInput";

const isHangulChar = (c: string) => /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(c);

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
  // 영타 조립 전 원본 키 버퍼 (직원코드 등 라틴 검색 폴백용)
  const rawRef = useRef("");
  const pendingLatinKeyRef = useRef<{ character: string; position: number } | null>(null);
  const composingRef = useRef(false);

  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => a.name.localeCompare(b.name, "ko-KR")),
    [employees],
  );

  const filtered = useMemo(() => {
    const q = normalizeSearchText(query);
    const raw = rawRef.current.trim();
    if (!q) return sortedEmployees;
    return sortedEmployees.filter(
      (e) =>
        matchesSearchFields([e.name, e.department, e.employee_code, toChosung(e.name)], query) ||
        // 자동 한영 조립 전 원문도 같은 AND 규칙으로 비교해 직원 코드를 보존한다.
        matchesSearchFields([toQwerty(e.name), toQwerty(e.department), e.employee_code], raw),
    );
  }, [sortedEmployees, query]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
        rawRef.current = "";
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
      rawRef.current = "";
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
        rawRef.current = "";
      }
    }
  };

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229) {
      pendingLatinKeyRef.current = null;
      return;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && /^[a-z]$/i.test(e.key)) {
      pendingLatinKeyRef.current = {
        character: e.shiftKey ? e.key.toUpperCase() : e.key.toLowerCase(),
        position: e.currentTarget.selectionStart ?? 0,
      };
    } else {
      pendingLatinKeyRef.current = null;
    }
    handleKey(e);
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
        <SearchInput
          inputRef={inputRef}
          inputProps={{
            id: inputId,
            type: "text",
            role: "combobox",
            "aria-controls": listId,
            "aria-expanded": open,
            "aria-autocomplete": "list",
            "aria-activedescendant": open && filtered[active] ? `${listId}-opt-${active}` : undefined,
            autoComplete: "off",
            className: "!h-auto !text-base placeholder:text-[var(--c-muted)]",
            onCompositionStart: () => { composingRef.current = true; pendingLatinKeyRef.current = null; },
            onCompositionEnd: () => { composingRef.current = false; },
          }}
          autoFocus={autoFocus}
          disabled={disabled}
          clearable={open && Boolean(query)}
          clearAriaLabel="직원 검색 지우기"
          leading={<UserIcon size={18} style={{ color: "var(--c-blue)", flexShrink: 0 }} />}
          className="gap-3 px-4 py-1 transition-colors focus-within:border-[var(--c-blue)]"
          style={{ opacity: disabled ? 0.6 : 1 }}
          placeholder="직원 이름 또는 부서 검색"
          value={displayValue}
          onClick={() => setOpen(true)}
          onChange={(next) => {
            // 이미 표시된 한글은 키로 되돌리고, 새로 입력된 라틴 문자는 그대로 이어붙여
            // 전체를 다시 한글로 조립한다. 실제 Shift 키 입력만 Shift 자모로 보존한다.
            const pendingLatinKey = pendingLatinKeyRef.current;
            let inputValue = next;
            if (pendingLatinKey) {
              const { character, position } = pendingLatinKey;
              if (inputValue.slice(position, position + 1).toLowerCase() === character.toLowerCase()) {
                inputValue = `${inputValue.slice(0, position)}${character}${inputValue.slice(position + 1)}`;
              }
              pendingLatinKeyRef.current = null;
            }
            const raw = Array.from(inputValue)
              .map((c) => (isHangulChar(c) ? toQwerty(c) : c))
              .join("");
            rawRef.current = raw;
            setQuery(toHangul(raw));
            setOpen(true);
          }}
          onKeyDown={handleInputKeyDown}
          trailing={<button
          type="button"
          tabIndex={-1}
          aria-label={open ? "직원 목록 닫기" : "직원 목록 열기"}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setOpen((prev) => !prev);
            inputRef.current?.focus();
          }}
          className="no-btn-inset -mr-3.5 flex min-h-11 min-w-11 shrink-0 items-center justify-center bg-transparent p-0"
          style={{ color: "var(--c-muted)", cursor: disabled ? "default" : "pointer" }}
        >
          <ChevronDown
            size={16}
            style={{
              transition: "transform 0.18s ease",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>}
        />

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
