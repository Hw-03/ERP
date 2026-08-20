"use client";

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { operatorSessionApi } from "@/lib/api/operator-session";
import {
  ApiError,
  AUTH_REQUIRED_EVENT,
  establishAuthRequiredBoundary,
} from "@/lib/api-core";
import { warehouseMapApi } from "@/lib/api/warehouse-map";
import { queryKeys } from "@/lib/queries/keys";
import { OperatorLoginCard } from "./OperatorLoginCard";
import {
  clearCurrentOperator,
  hasPendingOperatorLogout,
  OPERATOR_LOGOUT_PENDING_KEY,
  OPERATOR_LOGOUT_PENDING_EVENT,
  operatorFromEmployee,
  restoreCurrentOperator,
  retryPendingOperatorLogout,
} from "./useCurrentOperator";
import styles from "./MesLoginGate.module.css";

const PHASE_LOADING = 0;
const PHASE_INTRO = 1;
const PHASE_FORM = 2;
const PHASE_AUTHED = 3;
type GatePhase = 0 | 1 | 2 | 3;

/*
 * 위치 계산 (영구 로고가 카드 위로 이동, 페이지 상단과 카드 상단의 정확한 중간에 위치)
 * - 카드 상단 = calc(50vh - 280px)  (alignSelf: flex-start + marginTop)
 * - 목표: 로고 중심 = 카드 상단의 절반 = calc(25vh - 140px)
 * - 로고 중심 = 50vh - T × s  (scale s + translateY(-T))
 * - 50vh - T·s = 25vh - 140px → T = (25vh + 140px) / s
 * - 항목 4-1: s = 0.45 → T = (25vh + 140px) / 0.45 = 55.56vh + 311.11px
 * - 인트로 로고 자연 크기 840px, 축소 후 378px (scale 0.45, 종횡비 300:55 → 높이 69px)
 */
const SHRINK_TRANSFORM = "scale(0.45) translateY(calc(-55.56vh - 311.11px))";
const CENTER_TRANSFORM = "scale(1) translateY(0)";
// 항목 5-2 — 모바일만 인트로를 작게 시작(작게→크게 반전). 데스크톱은 CENTER_TRANSFORM(scale 1) 유지.
const MOBILE_CENTER_TRANSFORM = "scale(0.33) translateY(0)";
const MS_PER_DAY = 86400000;

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getWeekStartMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

interface MesLoginGateProps {
  children: React.ReactNode;
}

export function MesLoginGate({ children }: MesLoginGateProps) {
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;
  const [phase, setPhase] = useState<GatePhase>(PHASE_LOADING);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutRetrying, setLogoutRetrying] = useState(false);
  const [logoAbove, setLogoAbove] = useState(false);
  // 항목 5-2 — 모바일(<1024px)만 인트로 시작 스케일을 작게(작게→크게 반전). 데스크톱은 현행 유지.
  const [isNarrow, setIsNarrow] = useState(false);
  const pendingSequenceRef = useRef(0);
  const pendingBoundaryActiveRef = useRef(false);

  const showLogin = useCallback((pending: boolean) => {
    clearCurrentOperator();
    pendingBoundaryActiveRef.current = pending;
    setLogoutPending(pending);
    setLogoAbove(true);
    setPhase(PHASE_FORM);
  }, []);

  const adoptServerSession = useCallback(
    (session: Awaited<ReturnType<typeof operatorSessionApi.getOperatorSession>>) => {
      pendingBoundaryActiveRef.current = false;
      setLogoutPending(false);
      restoreCurrentOperator(operatorFromEmployee(session.employee), session.boot_id);
      const weekMon = getWeekStartMonday(new Date());
      const weekStart = toDateStr(weekMon);
      const weekEnd = toDateStr(new Date(weekMon.getTime() + 6 * MS_PER_DAY));
      void queryClientRef.current.prefetchQuery({
        queryKey: queryKeys.weekly.report(weekStart, weekEnd),
        queryFn: () => api.getWeeklyReport({ week_start: weekStart, week_end: weekEnd }),
      });
      void queryClientRef.current.prefetchQuery({
        queryKey: queryKeys.warehouseMap.map(),
        queryFn: () => warehouseMapApi.getMap(),
      });
      setPhase(PHASE_AUTHED);
    },
    [],
  );

  const reconcileClearedPendingLogout = useCallback(
    async (sequence: number): Promise<void> => {
      if (sequence !== pendingSequenceRef.current || hasPendingOperatorLogout()) return;
      setLogoutPending(true);
      try {
        const session = await operatorSessionApi.getOperatorSession();
        if (sequence !== pendingSequenceRef.current || hasPendingOperatorLogout()) return;
        adoptServerSession(session);
      } catch (error) {
        if (sequence !== pendingSequenceRef.current || hasPendingOperatorLogout()) return;
        showLogin(!(error instanceof ApiError && error.status === 401));
      }
    },
    [adoptServerSession, showLogin],
  );

  // 초기 인증 상태 확인
  // 페인트 전에 뷰포트 폭을 확정해 인트로 첫 프레임이 데스크톱 기본값(scale 1=840px)으로
  // 잠깐 떴다가 축소되는 플래시를 방지(항목 5-2).
  useLayoutEffect(() => {
    setIsNarrow(window.matchMedia("(max-width: 1023px)").matches);
  }, []);

  useEffect(() => {
    const requireLogin = () => showLogin(
      hasPendingOperatorLogout() || pendingBoundaryActiveRef.current,
    );
    const syncPendingLogout = (crossTab: boolean) => {
      const pending = hasPendingOperatorLogout();
      const sequence = ++pendingSequenceRef.current;
      if (pending) {
        const openBoundary = crossTab && !pendingBoundaryActiveRef.current;
        pendingBoundaryActiveRef.current = true;
        setLogoutPending(true);
        if (openBoundary) establishAuthRequiredBoundary();
        return;
      }
      if (!pendingBoundaryActiveRef.current) {
        setLogoutPending(false);
        return;
      }
      setLogoutPending(true);
      void reconcileClearedPendingLogout(sequence);
    };
    const syncLocalPendingLogout = () => syncPendingLogout(false);
    const syncStoredPendingLogout = (event: StorageEvent) => {
      if (event.key !== null && event.key !== OPERATOR_LOGOUT_PENDING_KEY) return;
      syncPendingLogout(true);
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, requireLogin);
    window.addEventListener(OPERATOR_LOGOUT_PENDING_EVENT, syncLocalPendingLogout);
    window.addEventListener("storage", syncStoredPendingLogout);
    return () => {
      window.removeEventListener(AUTH_REQUIRED_EVENT, requireLogin);
      window.removeEventListener(OPERATOR_LOGOUT_PENDING_EVENT, syncLocalPendingLogout);
      window.removeEventListener("storage", syncStoredPendingLogout);
    };
  }, [reconcileClearedPendingLogout, showLogin]);

  useEffect(() => {
    let cancelled = false;
    const goToLogin = () => {
      if (cancelled) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        setLogoAbove(true);
        setPhase(PHASE_FORM);
      } else {
        setPhase(PHASE_INTRO);
      }
    };

    void (async () => {
      if (hasPendingOperatorLogout()) {
        clearCurrentOperator();
        pendingBoundaryActiveRef.current = true;
        setLogoutPending(true);
        try {
          await retryPendingOperatorLogout();
        } catch {
          if (cancelled) return;
          showLogin(true);
        }
        return;
      }
      const restoreSequence = pendingSequenceRef.current;
      try {
        const session = await operatorSessionApi.getOperatorSession();
        if (cancelled) return;
        if (restoreSequence !== pendingSequenceRef.current) return;
        adoptServerSession(session);
      } catch {
        if (cancelled) return;
        if (restoreSequence !== pendingSequenceRef.current) return;
        clearCurrentOperator();
        goToLogin();
      }
    })();

    return () => { cancelled = true; };
  }, [adoptServerSession, showLogin]);

  const retryLogout = useCallback(async () => {
    if (logoutRetrying) return;
    setLogoutRetrying(true);
    try {
      if (hasPendingOperatorLogout()) {
        await retryPendingOperatorLogout();
      } else {
        const sequence = ++pendingSequenceRef.current;
        await reconcileClearedPendingLogout(sequence);
      }
    } catch {
      setLogoutPending(true);
    } finally {
      setLogoutRetrying(false);
    }
  }, [logoutRetrying, reconcileClearedPendingLogout]);

  // 인트로 단계 진입 → 로고 축소 → 카드 등장 (≤ 1.5s 절제된 시퀀스)
  useEffect(() => {
    if (phase !== PHASE_INTRO) return;
    const t1 = setTimeout(() => setLogoAbove(true), 600);
    const t2 = setTimeout(() => setPhase(PHASE_FORM), 1100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [phase]);

  const handleLogin = () => {
    if (logoutPending) return;
    // 작업자 로그인 시 직전 메뉴와 무관하게 항상 대시보드로 진입.
    if (typeof window !== "undefined") {
      const currentTab = new URLSearchParams(window.location.search).get("tab");
      if (currentTab !== "dashboard") {
        window.location.replace("/mes?tab=dashboard");
        return;
      }
    }
    setPhase(PHASE_AUTHED);
  };

  // SSR/hydration 깜빡임 방지
  if (phase === PHASE_LOADING) return null;

  // 로그인 완료 → 메인 화면
  if (phase === PHASE_AUTHED) return <>{children}</>;

  return (
    <div
      className={styles.root}
    >
      {/* 영구 로고 — phase 와 무관하게 항상 같은 element 로 렌더 (flicker 방지) */}
      {/* outer: 위치 이동 transform / inner: 인트로 fade+scale 애니메이션 (충돌 방지) */}
      <div
        className={styles.logo}
        style={{
          transform: logoAbove
            ? SHRINK_TRANSFORM
            : isNarrow ? MOBILE_CENTER_TRANSFORM : CENTER_TRANSFORM,
        }}
      >
        <div
          style={{
            animation: phase === PHASE_INTRO ? "mes-logo-fade-in 0.5s ease both" : undefined,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/dexcowin-logo.png"
            alt="DEXCOWIN"
            width={840}
            draggable={false}
            className={styles.logoImage}
          />
        </div>
      </div>

      {/* 배경 패턴 — form 단계에만 표시 */}
      {phase === PHASE_FORM && (
        <div
          className={styles.pattern}
        />
      )}

      {/* 데스크톱 로그인 여백에서 카드 방향을 안내하는 DEXRAY 마스코트 */}
      {phase === PHASE_FORM && (
        <div
          aria-hidden="true"
          className={`${styles.mascot} pointer-events-none absolute hidden lg:block`}
        >
          <Image
            src="/images/login/dexray-pointing-left.webp"
            alt=""
            width={607}
            height={640}
            sizes="(min-width: 2112px) 380px, (min-width: 1444px) 18vw, (min-width: 1024px) 260px, 0px"
            loading="eager"
            draggable={false}
            className="h-auto w-full select-none"
          />
        </div>
      )}

      {/* 카드 — form 단계에만 등장 (rise 애니메이션) */}
      {phase === PHASE_FORM && (
        <div
          className={`${styles.card} mes-card-anim`}
        >
          <OperatorLoginCard
            onLogin={handleLogin}
            logoutPending={logoutPending}
            logoutRetrying={logoutRetrying}
            onRetryLogout={() => void retryLogout()}
          />
        </div>
      )}
    </div>
  );
}
