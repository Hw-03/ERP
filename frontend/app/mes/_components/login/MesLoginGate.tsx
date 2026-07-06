"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { warehouseMapApi } from "@/lib/api/warehouse-map";
import { queryKeys } from "@/lib/queries/keys";
import { OperatorLoginCard } from "./OperatorLoginCard";
import { clearCurrentOperator, getStoredBootId, readCurrentOperator } from "./useCurrentOperator";

type GatePhase = "loading" | "intro" | "form" | "authed";
type LogoState = "center" | "above-card";

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
  const [phase, setPhase] = useState<GatePhase>("loading");
  const [logoState, setLogoState] = useState<LogoState>("center");
  // 항목 5-2 — 모바일(<1024px)만 인트로 시작 스케일을 작게(작게→크게 반전). 데스크톱은 현행 유지.
  const [isNarrow, setIsNarrow] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  // 초기 인증 상태 확인
  // 페인트 전에 뷰포트 폭을 확정해 인트로 첫 프레임이 데스크톱 기본값(scale 1=840px)으로
  // 잠깐 떴다가 축소되는 플래시를 방지(항목 5-2).
  useLayoutEffect(() => {
    setIsNarrow(window.matchMedia("(max-width: 1023px)").matches);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const goToLogin = () => {
      if (cancelled) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        setLogoState("above-card");
        setPhase("form");
      } else {
        setPhase("intro");
      }
    };

    const stored = readCurrentOperator();
    if (!stored) {
      goToLogin();
      return () => { cancelled = true; };
    }

    const weekMon = getWeekStartMonday(new Date());
    const weekStart = toDateStr(weekMon);
    const weekEnd = toDateStr(new Date(weekMon.getTime() + 6 * MS_PER_DAY));
    void queryClient.prefetchQuery({
      queryKey: queryKeys.weekly.report(weekStart, weekEnd),
      queryFn: () => api.getWeeklyReport({ week_start: weekStart, week_end: weekEnd }),
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.warehouseMap.map(),
      queryFn: () => warehouseMapApi.getMap(),
    });

    void (async () => {
      // boot_id 불일치 시 서버 재시작 감지 → 재로그인 강제
      try {
        const session = await api.getAppSession();
        if (cancelled) return;
        const storedBootId = getStoredBootId();
        if (storedBootId !== session.boot_id) {
          clearCurrentOperator();
          goToLogin();
          return;
        }
      } catch {
        if (cancelled) return;
        clearCurrentOperator();
        goToLogin();
        return;
      }

      // 작업자 식별용 — 비활성 직원이면 자동 진입을 차단한다 (보안 인증 아님).
      try {
        const list = await api.getEmployees({ activeOnly: true });
        if (cancelled) return;
        const stillActive = list.some((e) => e.employee_id === stored.employee_id);
        if (stillActive) {
          setPhase("authed");
        } else {
          clearCurrentOperator();
          goToLogin();
        }
      } catch {
        if (cancelled) return;
        clearCurrentOperator();
        goToLogin();
      }
    })();

    return () => { cancelled = true; };
  }, [queryClient]);

  // 인트로 단계 진입 → 로고 축소 → 카드 등장 (≤ 1.5s 절제된 시퀀스)
  useEffect(() => {
    if (phase !== "intro") return;
    const t1 = setTimeout(() => setLogoState("above-card"), 600);
    const t2 = setTimeout(() => setPhase("form"), 1100);
    timersRef.current = [t1, t2];
    return clearTimers;
  }, [phase]);

  const handleLogin = () => {
    // 작업자 로그인 시 직전 메뉴와 무관하게 항상 대시보드로 진입.
    if (typeof window !== "undefined") {
      const currentTab = new URLSearchParams(window.location.search).get("tab");
      if (currentTab !== "dashboard") {
        window.location.replace("/mes?tab=dashboard");
        return;
      }
    }
    setPhase("authed");
  };

  // SSR/hydration 깜빡임 방지
  if (phase === "loading") return null;

  // 로그인 완료 → 메인 화면
  if (phase === "authed") return <>{children}</>;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "var(--c-bg)" }}
    >
      {/* 영구 로고 — phase 와 무관하게 항상 같은 element 로 렌더 (flicker 방지) */}
      {/* outer: 위치 이동 transform / inner: 인트로 fade+scale 애니메이션 (충돌 방지) */}
      <div
        className="pointer-events-none absolute"
        style={{
          transform: logoState === "above-card"
            ? SHRINK_TRANSFORM
            : isNarrow ? MOBILE_CENTER_TRANSFORM : CENTER_TRANSFORM,
          transition: "transform 0.9s cubic-bezier(0.4, 0, 0.2, 1)",
          transformOrigin: "center center",
        }}
      >
        <div
          style={{
            animation: phase === "intro" ? "mes-logo-fade-in 0.5s ease both" : undefined,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/dexcowin-logo.png"
            alt="DEXCOWIN"
            width={840}
            draggable={false}
            style={{ width: 840, maxWidth: "none", height: "auto", userSelect: "none" }}
          />
        </div>
      </div>

      {/* 배경 패턴 — form 단계에만 표시 */}
      {phase === "form" && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle, var(--c-border) 1px, transparent 1px)`,
            backgroundSize: "28px 28px",
            opacity: 0.5,
          }}
        />
      )}

      {/* 카드 — form 단계에만 등장 (rise 애니메이션) */}
      {phase === "form" && (
        <div
          className="mes-card-anim w-full"
          style={{
            animation: "mes-card-rise 0.6s ease both",
            // 카드만 top 정렬 + 고정 marginTop → 카드 height 가 변해도 카드 상단 위치 일정 (로고 겹침 방지)
            alignSelf: "flex-start",
            marginTop: "calc(50vh - 280px)",
          }}
        >
          <OperatorLoginCard onLogin={handleLogin} />
        </div>
      )}
    </div>
  );
}
