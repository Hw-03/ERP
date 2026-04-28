"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LoginIntro } from "./LoginIntro";
import { OperatorLoginCard } from "./OperatorLoginCard";
import { clearCurrentOperator, getStoredBootId, readCurrentOperator } from "./useCurrentOperator";

type GatePhase = "loading" | "intro" | "form" | "authed";

interface ErpLoginGateProps {
  children: React.ReactNode;
}

export function ErpLoginGate({ children }: ErpLoginGateProps) {
  const [phase, setPhase] = useState<GatePhase>("loading");

  useEffect(() => {
    let cancelled = false;
    const goToLogin = () => {
      if (cancelled) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setPhase(reduced ? "form" : "intro");
    };

    const stored = readCurrentOperator();
    if (!stored) {
      goToLogin();
      return () => { cancelled = true; };
    }

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
        // 서버 응답 불가 시 보수적으로 재로그인
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
  }, []);

  const handleLogin = () => {
    setPhase("authed");
  };

  // SSR/hydration 깜빡임 방지
  if (phase === "loading") return null;

  // 로그인 완료 → 기존 ERP 화면
  if (phase === "authed") return <>{children}</>;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "var(--c-bg)" }}
    >
      {phase === "intro" ? (
        <LoginIntro onSkip={() => setPhase("form")} onDone={() => setPhase("form")} />
      ) : (
        <div
          className="erp-card-anim w-full"
          style={{ animation: "erp-card-rise 0.5s ease forwards" }}
        >
          <OperatorLoginCard onLogin={handleLogin} />
        </div>
      )}
    </div>
  );
}
