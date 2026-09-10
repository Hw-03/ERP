"use client";

import Image from "next/image";
import {
  Activity,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type OperatorSessionResponse } from "@/lib/api";
import { operatorSessionApi } from "@/lib/api/operator-session";
import {
  ApiError,
  AUTH_REQUIRED_EVENT,
  establishAuthRequiredBoundary,
} from "@/lib/api-core";
import { warehouseMapApi } from "@/lib/api/warehouse-map";
import { formatKstDate } from "@/lib/mes/date";
import { queryKeys } from "@/lib/queries/keys";
import { OperatorLoginCard } from "./OperatorLoginCard";
import {
  clearCurrentOperator,
  getStoredBootId,
  hasPendingOperatorLogout,
  OPERATOR_LOGOUT_PENDING_KEY,
  OPERATOR_LOGOUT_PENDING_EVENT,
  operatorFromEmployee,
  readCurrentOperator,
  restoreCurrentOperator,
  retryPendingOperatorLogout,
} from "./useCurrentOperator";
import styles from "./MesLoginGate.module.css";
import {
  runLoginReadWithRetry,
  validateActiveEmployees,
  validateAppSession,
} from "./loginReadRetry";
import { useOperatorIdleSession } from "./useOperatorIdleSession";

const PHASE_LOADING = 0;
const PHASE_INTRO = 1;
const PHASE_FORM = 2;
const PHASE_AUTHED = 3;
const PHASE_RECOVERY = 4;
type GatePhase = 0 | 1 | 2 | 3 | 4;

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
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const [operatorSession, setOperatorSession] = useState<OperatorSessionResponse | null>(null);
  const [contentMounted, setContentMounted] = useState(false);
  const contentMountedRef = useRef(false);
  const contentOwnerIdRef = useRef<string | null>(null);
  const idleLockedOwnerIdRef = useRef<string | null>(null);
  const [contentKey, setContentKey] = useState(0);

  const discardPreservedContent = useCallback(() => {
    contentMountedRef.current = false;
    contentOwnerIdRef.current = null;
    idleLockedOwnerIdRef.current = null;
    setContentMounted(false);
    setOperatorSession(null);
    setContentKey((value) => value + 1);
  }, []);

  const showLogin = useCallback((pending: boolean) => {
    clearCurrentOperator();
    discardPreservedContent();
    pendingBoundaryActiveRef.current = pending;
    setLogoutPending(pending);
    setLogoAbove(true);
    setPhase(PHASE_FORM);
  }, [discardPreservedContent]);

  const showIdleLogin = useCallback((employeeId: string) => {
    if (!contentMountedRef.current || contentOwnerIdRef.current !== employeeId) {
      showLogin(false);
      return;
    }
    // 같은 직원 재인증까지 숨긴 화면의 작업자 연동 상태도 함께 보존한다.
    // 서버 cookie가 권한 정본이므로 화면 전용 cache를 남겨도 mutation 권한은 생기지 않는다.
    idleLockedOwnerIdRef.current = employeeId;
    setOperatorSession(null);
    pendingBoundaryActiveRef.current = false;
    setLogoutPending(false);
    setLogoAbove(true);
    setPhase(PHASE_FORM);
  }, [showLogin]);

  const adoptServerSession = useCallback(
    (session: Awaited<ReturnType<typeof operatorSessionApi.getOperatorSession>>) => {
      pendingBoundaryActiveRef.current = false;
      setLogoutPending(false);
      restoreCurrentOperator(operatorFromEmployee(session.employee), session.boot_id);
      if (contentOwnerIdRef.current !== session.employee.employee_id) {
        if (contentOwnerIdRef.current !== null) setContentKey((value) => value + 1);
        contentOwnerIdRef.current = session.employee.employee_id;
      }
      contentMountedRef.current = true;
      setContentMounted(true);
      setOperatorSession(session);
      const weekMon = getWeekStartMonday(new Date());
      const weekStart = formatKstDate(weekMon);
      const weekEnd = formatKstDate(new Date(weekMon.getTime() + 6 * MS_PER_DAY));
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

  const handleIdleExpired = useCallback((_employeeId: string) => {
    establishAuthRequiredBoundary("idle");
  }, []);

  const idleSession = useOperatorIdleSession({
    session: operatorSession,
    active: phase === PHASE_AUTHED,
    onExpired: handleIdleExpired,
  });

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
    const requireLogin = (event: Event) => {
      pendingSequenceRef.current += 1;
      const reason = event instanceof CustomEvent
        ? (event.detail as { reason?: string } | undefined)?.reason
        : undefined;
      if (reason === "idle" && contentOwnerIdRef.current) {
        showIdleLogin(contentOwnerIdRef.current);
        return;
      }
      // A confirmed auth failure ends reconciliation; only an actual revoke marker blocks login.
      showLogin(hasPendingOperatorLogout());
    };
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
  }, [reconcileClearedPendingLogout, showIdleLogin, showLogin]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
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
    const showRecovery = () => {
      if (cancelled) return;
      setLogoAbove(true);
      setPhase(PHASE_RECOVERY);
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
      let serverSession: Awaited<ReturnType<typeof operatorSessionApi.getOperatorSession>>;
      try {
        serverSession = await runLoginReadWithRetry(
          (readSignal) => operatorSessionApi.getOperatorSession(readSignal),
          { stage: "operator_session", signal: controller.signal },
        );
      } catch (error) {
        if (cancelled || restoreSequence !== pendingSequenceRef.current) return;
        if (error instanceof ApiError && error.status === 401) {
          clearCurrentOperator();
          goToLogin();
        } else if (readCurrentOperator()) {
          showRecovery();
        } else {
          clearCurrentOperator();
          goToLogin();
        }
        return;
      }
      if (cancelled || restoreSequence !== pendingSequenceRef.current) return;

      const stored = readCurrentOperator();
      if (!stored) {
        adoptServerSession(serverSession);
        return;
      }

      try {
        const appSession = await runLoginReadWithRetry(
          (readSignal) => api.getAppSession(readSignal),
          {
            stage: "app_session",
            signal: controller.signal,
            validate: validateAppSession,
          },
        );
        if (cancelled || restoreSequence !== pendingSequenceRef.current) return;
        const storedBootId = getStoredBootId();
        if (
          storedBootId !== appSession.boot_id
          || serverSession.boot_id !== appSession.boot_id
        ) {
          clearCurrentOperator();
          goToLogin();
          return;
        }

        const employees = await runLoginReadWithRetry(
          (readSignal) => api.getEmployees({ activeOnly: true }, readSignal),
          {
            stage: "active_employees",
            signal: controller.signal,
            validate: validateActiveEmployees,
          },
        );
        if (cancelled || restoreSequence !== pendingSequenceRef.current) return;
        const stillActive = employees.some(
          (employee) => employee.employee_id === serverSession.employee.employee_id,
        );
        if (!stillActive) {
          clearCurrentOperator();
          goToLogin();
          return;
        }
        adoptServerSession(serverSession);
      } catch {
        if (cancelled || restoreSequence !== pendingSequenceRef.current) return;
        showRecovery();
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [adoptServerSession, recoveryAttempt, showLogin]);

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

  const handleLogin = (session: OperatorSessionResponse) => {
    if (logoutPending) return;
    const idleOwnerId = idleLockedOwnerIdRef.current;
    const restoresIdleDraft = idleOwnerId === session.employee.employee_id;
    if (idleOwnerId && !restoresIdleDraft) discardPreservedContent();
    idleLockedOwnerIdRef.current = null;
    // 작업자 로그인 시 직전 메뉴와 무관하게 항상 대시보드로 진입.
    if (!restoresIdleDraft && typeof window !== "undefined") {
      const currentTab = new URLSearchParams(window.location.search).get("tab");
      if (currentTab !== "dashboard") {
        window.location.replace("/mes?tab=dashboard");
        return;
      }
    }
    adoptServerSession(session);
  };

  const retryStoredLogin = () => {
    setPhase(PHASE_LOADING);
    setRecoveryAttempt((attempt) => attempt + 1);
  };

  // SSR/hydration 깜빡임 방지
  if (phase === PHASE_LOADING) return null;

  const preservedContent = contentMounted ? (
    <Activity
      key={contentKey}
      mode={phase === PHASE_AUTHED && idleSession.warningSeconds !== 0 ? "visible" : "hidden"}
    >
      {children}
    </Activity>
  ) : null;

  // 로그인 완료 → 메인 화면
  if (phase === PHASE_AUTHED) {
    return (
      <>
        {preservedContent}
        {idleSession.warningSeconds === 0 && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="idle-session-check-title"
          >
            <div
              className="w-full max-w-sm rounded-[24px] border p-6 text-center"
              style={{
                background: "var(--c-s1)",
                borderColor: "var(--c-border)",
                boxShadow: "var(--c-card-shadow)",
              }}
            >
              <h2 id="idle-session-check-title" className="text-lg font-semibold" style={{ color: "var(--c-text)" }}>
                화면이 잠겼습니다
              </h2>
              <p className="mt-2 text-sm" style={{ color: "var(--c-muted)" }}>
                서버에서 로그인 만료 여부를 확인하고 있습니다.
              </p>
              {idleSession.renewalError && (
                <p className="mt-3 text-sm" role="alert" style={{ color: "var(--c-danger)" }}>
                  {idleSession.renewalError}
                </p>
              )}
              <button
                type="button"
                onClick={() => void idleSession.renewNow()}
                disabled={idleSession.renewing}
                className="mt-5 min-h-11 w-full rounded-[14px] px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--c-blue)" }}
              >
                {idleSession.renewing ? "로그인 상태 확인 중..." : "다시 확인"}
              </button>
            </div>
          </div>
        )}
        {idleSession.warningSeconds !== null && idleSession.warningSeconds > 0 && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/35 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="idle-session-title"
          >
            <div
              className="w-full max-w-sm rounded-[24px] border p-6 text-center"
              style={{
                background: "var(--c-s1)",
                borderColor: "var(--c-border)",
                boxShadow: "var(--c-card-shadow)",
              }}
            >
              <h2 id="idle-session-title" className="text-lg font-semibold" style={{ color: "var(--c-text)" }}>
                곧 자동 로그아웃됩니다
              </h2>
              <p className="mt-2 text-sm" style={{ color: "var(--c-muted)" }}>
                마지막 활동 후 30분이 지나면 화면이 잠깁니다.
              </p>
              <p className="mt-4 text-2xl font-bold tabular-nums" style={{ color: "var(--c-blue)" }}>
                {idleSession.warningSeconds}초
              </p>
              {idleSession.renewalError && (
                <p className="mt-3 text-sm" role="alert" style={{ color: "var(--c-danger)" }}>
                  {idleSession.renewalError}
                </p>
              )}
              <button
                type="button"
                onClick={() => void idleSession.renewNow()}
                disabled={idleSession.renewing}
                className="mt-5 min-h-11 w-full rounded-[14px] px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--c-blue)" }}
              >
                {idleSession.renewing ? "로그인 유지 확인 중..." : "로그인 유지"}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {preservedContent}
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
      {(phase === PHASE_FORM || phase === PHASE_RECOVERY) && (
        <div
          className={styles.pattern}
        />
      )}

      {/* 데스크톱 로그인 여백에서 카드 방향을 안내하는 DEXRAY 마스코트 */}
      {(phase === PHASE_FORM || phase === PHASE_RECOVERY) && (
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
      {phase === PHASE_RECOVERY && (
        <div
          className="mes-card-anim mx-auto w-full"
          style={{ maxWidth: 440, padding: "0 16px", animation: "mes-card-rise 0.35s ease both" }}
        >
          <div
            className="rounded-[24px] border p-8 text-center"
            style={{ background: "var(--c-s1)", borderColor: "var(--c-border)", boxShadow: "var(--c-card-shadow)" }}
          >
            <p className="text-base font-semibold" style={{ color: "var(--c-text)" }}>로그인 정보를 확인하지 못했습니다.</p>
            <p className="mt-2 text-sm" role="alert" style={{ color: "var(--c-muted)" }}>
              서버 연결을 확인한 뒤 다시 시도해 주세요.
            </p>
            <button
              type="button"
              onClick={retryStoredLogin}
              className="mt-6 w-full rounded-[14px] py-3 text-base font-semibold text-white"
              style={{ background: "var(--c-blue)" }}
            >
              다시 시도
            </button>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
