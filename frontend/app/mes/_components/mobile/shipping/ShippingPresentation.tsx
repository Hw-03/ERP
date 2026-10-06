"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import type { ShippingRequest } from "@/lib/api";
import { LEGACY_COLORS as C } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { IconButton, WizardProgress } from "../primitives";

/** 출하 화면의 제목과 진행 상태를 본문 스크롤 밖에서 유지한다. */
export function ShippingHeader({ title, subtitle, onBack, backLabel = "뒤로", right, progress, disabled = false }: {
  title: string; subtitle?: string; onBack?: () => void; backLabel?: string;
  right?: ReactNode; progress?: { steps: readonly { key: string; label: string }[]; current: number }; disabled?: boolean;
}) {
  return <header className="mx-3 mb-3 flex shrink-0 items-center gap-2 rounded-[12px] border px-2 py-2 [@media(max-height:500px)]:py-1" style={{ background: C.s2, borderColor: C.border, color: C.text }}>
    {onBack && <IconButton icon={ArrowLeft} label={backLabel} onClick={onBack} disabled={disabled} />}
    <div className="min-w-0 flex-1">
      {subtitle && <p className="truncate text-xs font-medium" style={{ color: C.muted2 }}>{subtitle}</p>}
      <h1 className="text-lg font-bold leading-tight">{title}</h1>
    </div>
    {progress && <div className="w-[35%] min-w-20 shrink-0"><span className="mb-1 block text-right text-xs font-medium" style={{ color: C.muted2 }}>{progress.current + 1} / {progress.steps.length}</span><WizardProgress steps={[...progress.steps]} current={progress.current} variant="inline" /></div>}
    {right}
  </header>;
}

/** 선택 동작과 품명 펼침을 분리해 중첩 버튼을 만들지 않는다. */
export function ShippingItemName({ name, className = "" }: { name: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || expanded) return;
    const measure = () => setOverflow(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [name, expanded]);
  return <div className={`flex min-w-0 items-start gap-1 ${className}`}>
    <span ref={ref} id={id} className={`min-w-0 flex-1 break-words ${expanded ? "" : "line-clamp-2"}`}>{name}</span>
    {(overflow || expanded) && <button type="button" aria-label={expanded ? "품명 접기" : "전체 품명 보기"} aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)} className="-my-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] transition active:scale-95" style={{ color: C.blue }}>
      {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
    </button>}
  </div>;
}

/** 펼침 상태는 입력과 독립적이며 접어도 자식 입력을 마운트한 채 보존한다. */
export function ShippingAccordion({ title, summary, defaultOpen = false, children }: { title: string; summary?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return <section className="overflow-hidden rounded-[20px] border" style={{ background: C.s1, borderColor: C.border, color: C.text }}>
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="flex min-h-14 w-full items-center gap-2 px-4 py-3 text-left">
      <span className="min-w-0 flex-1 text-base font-bold">{title}</span>
      {summary && <span className="text-xs font-medium" style={{ color: C.muted2 }}>{summary}</span>}
      <ChevronDown size={20} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    <div id={id} hidden={!open} className="border-t p-4" style={{ borderColor: C.border }}>{children}</div>
  </section>;
}

const STATUS = { PREPARING: ["준비 중", C.blue], PREPARED: ["준비 완료", C.green], PICKED_UP: ["픽업 완료", C.purple], CANCELLED: ["요청 취소", C.muted2] } as const;

export function ShippingStatus({ status }: { status: ShippingRequest["status"] }) {
  const [label, color] = STATUS[status];
  return <span className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-bold" style={{ color, background: tint(color, 10) }}>{label}</span>;
}
