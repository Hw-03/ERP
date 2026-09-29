"use client";

import { useEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import { ArrowLeft, Building2, Check, ShieldAlert, Trash2, Warehouse, Wrench } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import styles from "./DefectWorkChoice.module.css";

export type DefectWorkAction = "add" | "scrap" | "rework";
export type DefectSourceKind = "production" | "warehouse";

interface Props {
  action: DefectWorkAction | null;
  source: DefectSourceKind | null;
  onActionChange: (action: DefectWorkAction) => void;
  onProceed: (action: DefectWorkAction, source: DefectSourceKind) => void;
  onCancel: () => void;
}

const EXIT_FALLBACK_MS = 160;
const WORK_OPTIONS = [
  { action: "add", title: "격리 등록", description: "품목을 격리하고 불량·B급·구형으로 분류합니다.", icon: ShieldAlert, tone: LEGACY_COLORS.red },
  { action: "scrap", title: "즉시 폐기", description: "정상 재고를 격리 없이 즉시 폐기합니다.", icon: Trash2, tone: LEGACY_COLORS.red },
  { action: "rework", title: "즉시 재작업", description: "부서 재고의 BOM 있는 품목을 정상·격리·폐기로 나눕니다.", icon: Wrench, tone: LEGACY_COLORS.yellow },
] as const;

/** 선택은 같은 화면에서 바꾸고, 출처가 확정된 뒤에만 품목 단계로 이동한다. */
export function DefectWorkChoice({ action, source, onActionChange, onProceed, onCancel }: Props): JSX.Element {
  const [leaving, setLeaving] = useState(false);
  const [pickedSource, setPickedSource] = useState<DefectSourceKind | null>(null);
  const pending = useRef<{ action: DefectWorkAction; source: DefectSourceKind } | null>(null);
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

  function beginExit(nextAction: DefectWorkAction, nextSource: DefectSourceKind): void {
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

  function selectAction(nextAction: DefectWorkAction): void {
    if (leaving) return;
    onActionChange(nextAction);
    if (nextAction === "rework") beginExit(nextAction, "production");
  }

  function cancel(): void {
    if (timer.current !== null) clearTimeout(timer.current);
    pending.current = null;
    onCancel();
  }

  return (
    <div data-testid="defect-work-choice" aria-busy={leaving} className={`${styles.root} ${leaving ? styles.leaving : ""}`}
      onAnimationEnd={(event) => { if (event.target === event.currentTarget) completeExit(); }}>
      <header className={styles.header}>
        <button type="button" onClick={cancel} className={`standard-hover ${styles.back}`}><ArrowLeft size={16} /> 이전</button>
        <h2 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>불량 처리</h2>
      </header>

      <div className={`${styles.content} ${showSource ? styles.withSource : ""}`}>
        <section aria-label="작업 선택" className={styles.workSection}>
          <h3 className={styles.sectionLabel}>작업 선택</h3>
          <div className={styles.workGrid}>
            {WORK_OPTIONS.map(({ action: option, title, description, icon: Icon, tone }) => {
              const active = action === option;
              return (
                <button key={option} type="button" aria-pressed={active} disabled={leaving} onClick={() => selectAction(option)}
                  className={`standard-hover no-btn-inset ${styles.card} ${styles.workCard}`}
                  style={{ "--choice-tone": tone, background: active ? tint(tone, 10) : LEGACY_COLORS.s2, borderColor: active ? tone : LEGACY_COLORS.border } as CSSProperties}>
                  <div className={styles.cardHeading}>
                    <span className={styles.icon}><Icon size={24} /></span>
                    <div className={styles.cardTitle}>{title}</div>
                    {active && <span className={styles.selectionMark}><Check size={20} /></span>}
                  </div>
                  <p className={styles.description}>{description}</p>
                </button>
              );
            })}
          </div>
        </section>

        <div className={`${styles.sourceReveal} ${showSource ? styles.expanded : ""}`} aria-hidden={!showSource} inert={!showSource}>
          <div className={styles.sourceClip}>
            <section aria-label="출처 선택" className={styles.sourceSection}>
              <h3 className={styles.sectionLabel}>출처 선택</h3>
              <div className={styles.sourceGrid}>
                {(["production", "warehouse"] as const).map((option) => {
                  const Icon = option === "production" ? Building2 : Warehouse;
                  const active = (pickedSource ?? source) === option;
                  return (
                    <button key={option} type="button" aria-pressed={active} disabled={leaving} onClick={() => { if (showSource && action) beginExit(action, option); }}
                      className={`standard-hover no-btn-inset ${styles.card} ${styles.sourceCard}`}
                      style={{ "--choice-tone": LEGACY_COLORS.red, background: active ? tint(LEGACY_COLORS.red, 10) : LEGACY_COLORS.s2, borderColor: active ? LEGACY_COLORS.red : LEGACY_COLORS.border } as CSSProperties}>
                      <div className={styles.cardHeading}>
                        <span className={styles.icon}><Icon size={24} /></span>
                        <div className={styles.cardTitle}>{option === "production" ? "부서 재고" : "창고 재고"}</div>
                        {active && <span className={styles.selectionMark}><Check size={20} /></span>}
                      </div>
                      <p className={styles.description}>{option === "production" ? "생산 부서에서 사용 중인 재고" : "창고에 보관 중인 정상 재고"}</p>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
