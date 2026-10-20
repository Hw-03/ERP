"use client";

import { useId, type CSSProperties, type KeyboardEvent } from "react";
import styles from "../_admin_primitives/AdminMasterData.module.css";

interface PermissionOption<T extends string> {
  value: T;
  label: string;
  hint: string;
  tone: string;
}

/** 동일 너비의 선택 칸 사이에서 하이라이트를 이동하며 편집 중인 값만 갱신한다. */
export function EmployeePermissionControl<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: PermissionOption<T>[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  const selectedIndex = options.findIndex((option) => option.value === value);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight": case "ArrowDown": nextIndex = (index + 1) % options.length; break;
      case "ArrowLeft": case "ArrowUp": nextIndex = (index - 1 + options.length) % options.length; break;
      case "Home": nextIndex = 0; break;
      case "End": nextIndex = options.length - 1; break;
      default: return;
    }
    event.preventDefault();
    onChange(options[nextIndex].value);
    document.getElementById(`${id}-${nextIndex}`)?.focus();
  }

  return <div role="radiogroup" aria-label={label} className={styles.permissionControl}
    style={{ "--permission-color": options[selectedIndex]?.tone } as CSSProperties}>
    <span aria-hidden="true" className={styles.permissionHighlight} style={{
      width: `calc((100% - 8px) / ${options.length})`,
      transform: `translateX(${selectedIndex * 100}%)`,
    }} />
    {options.map((option, index) => <button
      key={option.value}
      id={`${id}-${index}`}
      type="button"
      role="radio"
      aria-label={option.label}
      aria-checked={option.value === value}
      aria-describedby={`${id}-hint-${index}`}
      tabIndex={option.value === value ? 0 : -1}
      onClick={() => onChange(option.value)}
      onKeyDown={(event) => handleKeyDown(event, index)}
      className={styles.permissionOption}
      style={{ "--permission-color": option.tone } as CSSProperties}
      title={option.hint}
    >
      {option.label}<span id={`${id}-hint-${index}`} className="sr-only">{option.hint}</span>
    </button>)}
  </div>;
}
