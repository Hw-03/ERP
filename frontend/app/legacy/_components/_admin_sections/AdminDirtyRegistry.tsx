"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useUnsavedChangesGuard,
  type UnsavedChangesModalProps,
} from "@/lib/ui/useUnsavedChangesGuard";
import { UnsavedChangesModal } from "@/lib/ui/UnsavedChangesModal";

/**
 * AdminDirtyRegistry — PR-2 2-3.
 *
 * 직원·품목·부서 등 관리자 하위 섹션이 각자 자기 dirty/save 를 등록하면,
 * 상위(메인 탭, 사이드바, 항목 변경)에서 `confirmAdminNavigation(proceed)` 로
 * 한 번에 가드를 걸 수 있다.
 *
 * 어느 섹션이라도 dirty=true 면 모달이 뜬다. (사용자 단순화 요청)
 *
 * Provider 위치: DesktopLegacyShell (메인 탭 변경도 admin dirty 확인해야 하므로).
 */
type Entry = {
  dirty: boolean;
  save: () => Promise<void> | void;
};

type RegistryRef = {
  entries: Map<string, Entry>;
  bump: () => void;
};

const RegistryContext = createContext<RegistryRef | null>(null);

export function AdminDirtyProvider({ children }: { children: ReactNode }) {
  const entriesRef = useRef<Map<string, Entry>>(new Map());
  const [version, setVersion] = useState(0);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const registryRef = useMemo<RegistryRef>(
    () => ({ entries: entriesRef.current, bump }),
    [bump],
  );

  // 어느 entry 라도 dirty 면 dirty
  const aggregateDirty = useMemo(() => {
    const list = Array.from(entriesRef.current.values());
    return list.some((e) => e.dirty);
    // version 이 dependency — entry 갱신 시 bump 호출로 재계산.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // 활성 entry 중 dirty 인 것의 save 를 모두 순차 호출 (보통 1개)
  const aggregateSave = useCallback(async () => {
    const dirtyEntries = Array.from(entriesRef.current.values()).filter((e) => e.dirty);
    for (let i = 0; i < dirtyEntries.length; i += 1) {
      await Promise.resolve(dirtyEntries[i]!.save());
    }
  }, []);

  const { confirmNavigation, modalProps } = useUnsavedChangesGuard(
    aggregateDirty,
    aggregateSave,
  );

  const value = useMemo<AdminDirtyContextValue>(
    () => ({
      registry: registryRef,
      confirmAdminNavigation: confirmNavigation,
      modalProps,
    }),
    [registryRef, confirmNavigation, modalProps],
  );

  return (
    <AdminDirtyContext.Provider value={value}>
      <RegistryContext.Provider value={registryRef}>
        {children}
        <UnsavedChangesModal {...modalProps} />
      </RegistryContext.Provider>
    </AdminDirtyContext.Provider>
  );
}

export type AdminDirtyContextValue = {
  registry: RegistryRef;
  /** dirty 가 있으면 모달, 없으면 즉시 proceed 호출. */
  confirmAdminNavigation: (proceed: () => void) => void;
  modalProps: UnsavedChangesModalProps;
};

const AdminDirtyContext = createContext<AdminDirtyContextValue | null>(null);

export function useAdminDirty(): AdminDirtyContextValue {
  const ctx = useContext(AdminDirtyContext);
  if (!ctx) {
    throw new Error("useAdminDirty must be used inside <AdminDirtyProvider>");
  }
  return ctx;
}

/**
 * 섹션에서 자기 dirty/save 를 등록. 언마운트 또는 dirty=false 일 때도
 * 등록 자체는 유지 (값만 바뀜), 컴포넌트가 사라지면 cleanup 으로 제거.
 */
export function useRegisterAdminDirty(
  key: string,
  dirty: boolean,
  save: () => Promise<void> | void,
) {
  const ref = useContext(RegistryContext);
  // save 최신값 ref
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    if (!ref) return;
    ref.entries.set(key, {
      dirty,
      save: () => saveRef.current(),
    });
    ref.bump();
    return () => {
      ref.entries.delete(key);
      ref.bump();
    };
  }, [ref, key, dirty]);
}

/**
 * 항목 내부 가드 (트리거 (a) — 같은 페이지에서 다른 항목 선택).
 * 호출 컴포넌트가 자기 dirty/save 만 가지고 즉시 사용 가능.
 */
export function useLocalUnsavedGuard(
  dirty: boolean,
  save: () => Promise<void> | void,
) {
  return useUnsavedChangesGuard(dirty, save);
}
