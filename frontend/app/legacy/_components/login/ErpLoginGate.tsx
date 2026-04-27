"use client";

import { useEffect, useState } from "react";
import { LoginIntro } from "./LoginIntro";
import { LoginCard } from "./LoginCard";

const AUTH_KEY = "erp_auth";

type GatePhase = "loading" | "intro" | "form" | "authed";

interface ErpLoginGateProps {
  children: React.ReactNode;
}

export function ErpLoginGate({ children }: ErpLoginGateProps) {
  const [phase, setPhase] = useState<GatePhase>("loading");

  useEffect(() => {
    if (localStorage.getItem(AUTH_KEY) === "1") {
      setPhase("authed");
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPhase(reduced ? "form" : "intro");
  }, []);

  const handleLogin = () => {
    localStorage.setItem(AUTH_KEY, "1");
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
          <LoginCard onLogin={handleLogin} />
        </div>
      )}
    </div>
  );
}
