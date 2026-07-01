"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

type DirtyGuardMode = "save" | "confirm-only";

type ModalState = {
  open: boolean;
  busy: boolean;
  save: () => Promise<void> | void;
  proceed: () => void;
  confirmOnly: boolean;
};

type DirtyEntry = {
  dirty: boolean;
  save: () => Promise<void> | void;
  discard?: () => Promise<void> | void;
  confirmOnly: boolean;
};

type ProviderContextValue = {
  openModal: (save: () => Promise<void> | void, proceed: () => void, confirmOnly?: boolean) => void;
  registryRef: React.MutableRefObject<Map<string, DirtyEntry>>;
};

const DirtyGuardContext = createContext<ProviderContextValue | null>(null);

function DirtyModal({
  modal,
  onSaveAndProceed,
  onProceedWithoutSave,
  onCancel,
}: {
  modal: ModalState;
  onSaveAndProceed: () => void;
  onProceedWithoutSave: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!modal.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!modal.busy && e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal.open, modal.busy, onCancel]);
  if (!modal.open) return null;
  const confirmOnly = modal.confirmOnly;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,.55)" }}
      onClick={() => {
        if (!modal.busy) onCancel();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-[520px] rounded-[20px] border p-5"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-lg font-black" style={{ color: LEGACY_COLORS.text }}>
          {confirmOnly ? "나갈까요?" : "저장"}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onProceedWithoutSave}
            disabled={modal.busy}
            className="rounded-[14px] border px-5 py-2.5 text-sm font-bold"
            style={{
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.muted2,
              background: LEGACY_COLORS.s2,
            }}
          >
            {confirmOnly ? "나가기" : "저장하지 않고 이동"}
          </button>
          {!confirmOnly && (
            <button
              type="button"
              onClick={onSaveAndProceed}
              disabled={modal.busy}
              className="rounded-[14px] px-5 py-2.5 text-sm font-black text-white"
              style={{ background: LEGACY_COLORS.blue }}
            >
              {modal.busy ? "저장 중..." : "저장하고 이동"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
export function DirtyGuardProvider({ children }: { children: ReactNode }) {
  const registryRef = useRef<Map<string, DirtyEntry>>(new Map());
  const [modal, setModal] = useState<ModalState>({
    open: false,
    busy: false,
    save: () => {},
    proceed: () => {},
    confirmOnly: false,
  });

  const openModal = useCallback((save: () => Promise<void> | void, proceed: () => void, confirmOnly = false) => {
    setModal({ open: true, busy: false, save, proceed, confirmOnly });
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const anyDirty = Array.from(registryRef.current.values()).some((entry) => entry.dirty);
      if (!anyDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const ctx: ProviderContextValue = { openModal, registryRef };

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
    Array.from(registryRef.current.values()).forEach((entry) => {
      if (entry.dirty && entry.discard) {
        try { void entry.discard(); } catch {}
      }
    });
    const proceed = modal.proceed;
    setModal((prev) => ({ ...prev, open: false }));
    proceed();
  }, [modal]);

  const handleCancel = useCallback(() => {
    if (modal.busy) return;
    setModal((prev) => ({ ...prev, open: false }));
  }, [modal.busy]);

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

export function useRegisterDirty(
  key: string,
  dirty: boolean,
  save: () => Promise<void> | void,
  discard?: () => Promise<void> | void,
  options?: { mode?: DirtyGuardMode },
): void {
  const ctx = useContext(DirtyGuardContext);
  const saveRef = useRef(save);
  const discardRef = useRef(discard);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    discardRef.current = discard;
  }, [discard]);

  useEffect(() => {
    if (!ctx) return;
    ctx.registryRef.current.set(key, {
      dirty,
      save: () => saveRef.current(),
      discard: () => discardRef.current?.(),
      confirmOnly: options?.mode === "confirm-only",
    });
    return () => {
      ctx.registryRef.current.delete(key);
    };
  }, [ctx, key, dirty, options?.mode]);
}

export function useConfirmNavigation(): (proceed: () => void) => void {
  const ctx = useContext(DirtyGuardContext);
  if (!ctx) {
    throw new Error("useConfirmNavigation must be used inside <DirtyGuardProvider>");
  }

  return useCallback(
    (proceed: () => void) => {
      const dirtyEntries = Array.from(ctx.registryRef.current.values()).filter((entry) => entry.dirty);
      if (dirtyEntries.length === 0) {
        proceed();
        return;
      }
      const aggregateSave = async () => {
        for (const entry of dirtyEntries) {
          await Promise.resolve(entry.save());
        }
      };
      ctx.openModal(aggregateSave, proceed, dirtyEntries.every((entry) => entry.confirmOnly));
    },
    [ctx],
  );
}

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
