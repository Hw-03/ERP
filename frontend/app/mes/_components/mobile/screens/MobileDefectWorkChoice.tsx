"use client";

import { useEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import { Building2, ShieldAlert, Trash2, Warehouse, Wrench } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { MobileDefectStepHeader } from "./MobileDefectStepHeader";
import styles from "./MobileDefectChoices.module.css";

export type MobileDefectWorkAction = "add" | "scrap" | "rework";
export type MobileDefectSourceKind = "production" | "warehouse";

interface Props {
  action: MobileDefectWorkAction | null;
  source: MobileDefectSourceKind | null;
  onActionChange: (action: MobileDefectWorkAction) => void;
  onProceed: (action: MobileDefectWorkAction, source: MobileDefectSourceKind) => void;
  onCancel: () => void;
}

const EXIT_FALLBACK_MS = 160;
const WORK_OPTIONS = [
  { action: "add", title: "격리 등록", icon: ShieldAlert, tone: LEGACY_COLORS.red },
  { action: "scrap", title: "즉시 폐기", icon: Trash2, tone: LEGACY_COLORS.red },
  { action: "rework", title: "즉시 재작업", icon: Wrench, tone: LEGACY_COLORS.yellow },
] as const;

/** 출처를 확정한 뒤 퇴장 모션을 마치고 품목 단계로 한 번만 이동한다. */
export function MobileDefectWorkChoice({ action, source, onActionChange, onProceed, onCancel }: Props): JSX.Element {
  const [leaving, setLeaving] = useState(false);
  const [pickedSource, setPickedSource] = useState<MobileDefectSourceKind | null>(null);
  const pending = useRef<{ action: MobileDefectWorkAction; source: MobileDefectSourceKind } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSource = action === "add" || action === "scrap";

  useEffect(() => {
    function cancelExit(): void {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      pending.current = null;
    }
    function onPop(): void {
      cancelExit();
      setLeaving(false);
      setPickedSource(null);
    }
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      cancelExit();
    };
  }, []);

  function completeExit(): void {
    const selection = pending.current;
    if (!selection) return;
    pending.current = null;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    onProceed(selection.action, selection.source);
  }

  function beginExit(nextAction: MobileDefectWorkAction, nextSource: MobileDefectSourceKind): void {
    if (pending.current || leaving) return;
    pending.current = { action: nextAction, source: nextSource };
    setPickedSource(nextSource);
    setLeaving(true);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      completeExit();
      return;
    }
    timer.current = setTimeout(completeExit, EXIT_FALLBACK_MS);
  }

  function selectAction(nextAction: MobileDefectWorkAction): void {
    if (leaving) return;
    onActionChange(nextAction);
    if (nextAction === "rework") beginExit(nextAction, "production");
  }

  function cancel(): void {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    onCancel();
  }

  return (
    <div data-testid="mobile-defect-work-choice" aria-busy={leaving} className={`${styles.root} ${leaving ? styles.leaving : ""}`}
      onAnimationEnd={(event) => { if (event.target === event.currentTarget) completeExit(); }}>
      <MobileDefectStepHeader title={showSource ? "출처 선택" : "작업 선택"} steps={action === "rework" ? ["작업 선택", "품목 선택", "수량 조정", "BOM 확인"] : ["작업 선택", "출처 선택", "품목 선택", "수량 조정"]} current={showSource ? 1 : 0} onBack={cancel} />
      <div className={`${styles.content} ${showSource ? styles.withSource : ""}`}>
        <section aria-label="작업 선택" className={styles.workSection}>
          <div className={styles.workGrid}>
            {WORK_OPTIONS.map(({ action: option, title, icon: Icon, tone }) => (
              <button key={option} type="button" aria-pressed={action === option} disabled={leaving} onClick={() => selectAction(option)}
                className={`no-btn-inset ${styles.card}`} style={{ "--choice-tone": tone } as CSSProperties}>
                <span className={styles.icon} aria-hidden="true"><Icon size={32} /></span>
                <span className={styles.title}>{title}</span>
              </button>
            ))}
          </div>
        </section>
        <div className={`${styles.sourceReveal} ${showSource ? styles.expanded : ""}`} aria-hidden={!showSource} inert={!showSource}>
          <section aria-label="출처 선택" className={styles.sourceSection}>
            <h3 className={styles.sectionLabel}>출처 선택</h3>
            <div className={styles.sourceGrid}>
              {(["production", "warehouse"] as const).map((option) => {
                const Icon = option === "production" ? Building2 : Warehouse;
                const active = (pickedSource ?? source) === option;
                return (
                  <button key={option} type="button" aria-pressed={active} disabled={leaving} onClick={() => { if (showSource && action) beginExit(action, option); }}
                    className={`no-btn-inset ${styles.card}`} style={{ "--choice-tone": LEGACY_COLORS.red } as CSSProperties}>
                    <span className={styles.icon} aria-hidden="true"><Icon size={32} /></span>
                    <span className={styles.title}>{option === "production" ? "부서 재고" : "창고 재고"}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
