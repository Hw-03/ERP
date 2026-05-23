"use client";

/**
 * dirty-guard.tsx — W2 통합 모듈.
 *
 * "저장 안 된 변경" 가드를 단일 깊은 모듈로 제공.
 *
 * 공개 API (4개):
 *   <DirtyGuardProvider>          — 단일 Modal mount + 단일 beforeunload listener
 *   useRegisterDirty(key, d, s)   — 섹션 등록 (parent nav 가드용 aggregate)
 *   useConfirmNavigation()        — 상위(탭/사이드바)에서 트리거
 *   useLocalDirtyGuard(d, s)      — 섹션 내부 in-page swap
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";

// ---------------------------------------------------------------------------
// 내부 타입
// ---------------------------------------------------------------------------

type ModalState = {
  open: boolean;
  busy: boolean;
  save: () => Promise<void> | void;
  proceed: () => void;
};

type DirtyEntry = {
  dirty: boolean;
  save: () => Promise<void> | void;
};

type ProviderContextValue = {
  /** Provider의 단일 modal을 열기 위한 함수 */
  openModal: (save: () => Promise<void> | void, proceed: () => void) => void;
  /** aggregate dirty 체크용 registry 참조 */
  registryRef: React.MutableRefObject<Map<string, DirtyEntry>>;
  bumpVersion: () => void;
};

const DirtyGuardContext = createContext<ProviderContextValue | null>(null);

// ---------------------------------------------------------------------------
// 내부 모달 컴포넌트
// ---------------------------------------------------------------------------

function DirtyModal({ modal, onSaveAndProceed, onProceedWithoutSave, onCancel }: {
  modal: ModalState;
  onSaveAndProceed: () => void;
  onProceedWithoutSave: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const panelRef = useFocusTrap<HTMLDivElement>(modal.open);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!modal.open) return;
    const handler = (e: KeyboardEvent) => {
      if (modal.busy) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modal.open, modal.busy, onCancel]);

  if (!modal.open || !mounted) return null;

  const toneAccent = LEGACY_COLORS.yellow;

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,.55)" }}
      onClick={() => {
        if (!modal.busy) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={panelRef}
        className="w-full max-w-[520px] rounded-[24px] border p-6"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: `color-mix(in srgb, ${toneAccent} 50%, transparent)`,
          boxShadow: "var(--c-card-shadow)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" style={{ color: toneAccent }} />
          <div
            id={titleId}
            className="text-lg font-black"
            style={{ color: LEGACY_COLORS.text }}
          >
            저장하지 않은 변경 사항이 있습니다.
          </div>
        </div>

        <div
          className="mb-4 rounded-[12px] border px-3 py-2 text-xs font-bold"
          style={{
            background: `color-mix(in srgb, ${toneAccent} 10%, transparent)`,
            borderColor: `color-mix(in srgb, ${toneAccent} 40%, transparent)`,
            color: toneAccent,
          }}
        >
          저장하지 않고 이동하면 입력 내용이 사라집니다.
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onProceedWithoutSave}
            disabled={modal.busy}
            className="rounded-[14px] border px-5 py-2.5 text-sm font-bold transition-colors hover:brightness-125 disabled:opacity-50"
            style={{
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.muted2,
              background: LEGACY_COLORS.s2,
            }}
          >
            저장하지 않고 이동
          </button>
          <button
            type="button"
            onClick={onSaveAndProceed}
            disabled={modal.busy}
            className="rounded-[14px] px-5 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50"
            style={{ background: LEGACY_COLORS.blue }}
          >
            {modal.busy ? "저장 중..." : "저장하고 이동"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function DirtyGuardProvider({ children }: { children: ReactNode }) {
  const registryRef = useRef<Map<string, DirtyEntry>>(new Map());
  const [_version, setVersion] = useState(0);
  const bumpVersion = useCallback(() => setVersion((v) => v + 1), []);

  // 단일 modal 상태
  const [modal, setModal] = useState<ModalState>({
    open: false,
    busy: false,
    save: () => {},
    proceed: () => {},
  });

  const openModal = useCallback(
    (save: () => Promise<void> | void, proceed: () => void) => {
      setModal({ open: true, busy: false, save, proceed });
    },
    [],
  );

  // 단일 beforeunload listener — 등록된 entry 중 하나라도 dirty면 prompt
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const anyDirty = Array.from(registryRef.current.values()).some((e) => e.dirty);
      if (!anyDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const ctx = useMemo<ProviderContextValue>(
    () => ({ openModal, registryRef, bumpVersion }),
    [openModal, bumpVersion],
  );

  const handleSaveAndProceed = useCallback(() => {
    if (modal.busy) return;
    setModal((prev) => ({ ...prev, busy: true }));
    Promise.resolve()
      .then(() => modal.save())
      .then(() => {
        const proceed = modal.proceed;
        setModal((prev) => ({ ...prev, open: false, busy: false }));
        proceed();
      })
      .catch(() => {
        setModal((prev) => ({ ...prev, busy: false }));
      });
  }, [modal]);

  const handleProceedWithoutSave = useCallback(() => {
    if (modal.busy) return;
    const proceed = modal.proceed;
    setModal((prev) => ({ ...prev, open: false }));
    proceed();
  }, [modal]);

  const handleCancel = useCallback(() => {
    if (modal.busy) return;
    setModal((prev) => ({ ...prev, open: false }));
  }, [modal]);

  return (
    <DirtyGuardContext.Provider value={ctx}>
      {children}
      <DirtyModal
        modal={modal}
        onSaveAndProceed={handleSaveAndProceed}
        onProceedWithoutSave={handleProceedWithoutSave}
        onCancel={handleCancel}
      />
    </DirtyGuardContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// useRegisterDirty
// ---------------------------------------------------------------------------

/**
 * 섹션에서 자기 dirty/save 를 Provider 레지스트리에 등록.
 * 상위의 useConfirmNavigation() 이 aggregate dirty 체크에 사용.
 */
export function useRegisterDirty(
  key: string,
  dirty: boolean,
  save: () => Promise<void> | void,
): void {
  const ctx = useContext(DirtyGuardContext);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    if (!ctx) return;
    ctx.registryRef.current.set(key, { dirty, save: () => saveRef.current() });
    ctx.bumpVersion();
    return () => {
      ctx.registryRef.current.delete(key);
      ctx.bumpVersion();
    };
  }, [ctx, key, dirty]);
}

// ---------------------------------------------------------------------------
// useConfirmNavigation
// ---------------------------------------------------------------------------

/**
 * 상위(탭/사이드바)에서 호출.
 * 등록된 섹션 중 하나라도 dirty면 모달, 아니면 즉시 proceed.
 * aggregate save: dirty인 섹션의 save 모두 순차 호출.
 */
export function useConfirmNavigation(): (proceed: () => void) => void {
  const ctx = useContext(DirtyGuardContext);
  if (!ctx) {
    throw new Error("useConfirmNavigation must be used inside <DirtyGuardProvider>");
  }

  return useCallback(
    (proceed: () => void) => {
      const dirtyEntries = Array.from(ctx.registryRef.current.values()).filter(
        (e) => e.dirty,
      );
      if (dirtyEntries.length === 0) {
        proceed();
        return;
      }
      const aggregateSave = async () => {
        for (const entry of dirtyEntries) {
          await Promise.resolve(entry.save());
        }
      };
      ctx.openModal(aggregateSave, proceed);
    },
    [ctx],
  );
}

// ---------------------------------------------------------------------------
// useLocalDirtyGuard
// ---------------------------------------------------------------------------

/**
 * 섹션 내부 in-page swap (예: 직원 A → 직원 B 선택).
 * Provider의 단일 Modal 재사용.
 * Provider 밖에서 사용하면 throw.
 */
export function useLocalDirtyGuard(
  dirty: boolean,
  save: () => Promise<void> | void,
): { confirmNavigation: (proceed: () => void) => void } {
  const ctx = useContext(DirtyGuardContext);
  if (!ctx) {
    throw new Error("useLocalDirtyGuard must be used inside <DirtyGuardProvider>");
  }

  const dirtyRef = useRef(dirty);
  const saveRef = useRef(save);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const confirmNavigation = useCallback(
    (proceed: () => void) => {
      if (!dirtyRef.current) {
        proceed();
        return;
      }
      ctx.openModal(() => saveRef.current(), proceed);
    },
    [ctx],
  );

  return { confirmNavigation };
}
