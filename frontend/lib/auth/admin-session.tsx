"use client";

/**
 * Admin PIN 세션 — W3-B seam.
 *
 * Provider 가 mount 되면 in-memory PIN 상태를 보관하고, `api-core.ts` 의
 * `registerAdminPinProvider` 에 콜백을 등록한다. 이후 모든 API 요청이 자동으로
 * `X-Admin-Pin` 헤더를 주입 받는다 (PIN 이 있을 때만).
 *
 * 설계 결정:
 * - **in-memory only**: sessionStorage / localStorage 사용 금지.
 *   새로고침 시 PIN 재입력은 의도된 데모/보안 안전 동작.
 * - **호출자 코드 변경 최소**: 기존 payload.pin / query.pin 흐름은 그대로.
 *   백엔드 (W3-A) 의 PIN 추출 우선순위는 X-Admin-Pin → body.pin → query.pin.
 * - **인터페이스 깊이**: Provider + 1 hook (3 메소드) + 1 register = 5 ≤ 6.
 */

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
import { registerAdminPinProvider } from "@/lib/api-core";

export interface AdminSessionValue {
  pin: string | null;
  setPin: (pin: string) => void;
  clearPin: () => void;
}

const AdminSessionContext = createContext<AdminSessionValue | null>(null);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [pin, setPinState] = useState<string | null>(null);
  // 최신 PIN 을 참조하는 ref — registerAdminPinProvider 에 등록되는 콜백이
  // closure capture 로 stale 해지지 않도록 한다.
  const pinRef = useRef<string | null>(null);
  pinRef.current = pin;

  useEffect(() => {
    registerAdminPinProvider(() => pinRef.current);
    return () => {
      registerAdminPinProvider(() => null);
    };
  }, []);

  const setPin = useCallback((next: string) => {
    setPinState(next);
  }, []);

  const clearPin = useCallback(() => {
    setPinState(null);
  }, []);

  const value = useMemo<AdminSessionValue>(
    () => ({ pin, setPin, clearPin }),
    [pin, setPin, clearPin],
  );

  return (
    <AdminSessionContext.Provider value={value}>
      {children}
    </AdminSessionContext.Provider>
  );
}

export function useAdminSession(): AdminSessionValue {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) {
    throw new Error(
      "useAdminSession must be used within <AdminSessionProvider>",
    );
  }
  return ctx;
}
