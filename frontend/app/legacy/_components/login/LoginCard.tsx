"use client";

import { useState, type FormEvent } from "react";
import { User, Lock, ArrowRight, Loader2 } from "lucide-react";

interface LoginCardProps {
  onLogin: () => void;
}

export function LoginCard({ onLogin }: LoginCardProps) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = id.trim().length > 0 && pw.length > 0 && !loading;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    onLogin();
  };

  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: "420px", padding: "0 16px" }}>
      <div
        className="relative w-full rounded-[24px] border p-8"
        style={{
          background: "var(--c-s1)",
          borderColor: "var(--c-border)",
          boxShadow: "var(--c-card-shadow)",
        }}
      >
        {/* 헤더 */}
        <div className="mb-6">
          <p
            className="mb-2 font-mono text-xs uppercase tracking-[0.18em]"
            style={{ color: "var(--c-blue)" }}
          >
            {"// ACCESS TERMINAL"}
          </p>
          <h1 className="text-2xl font-bold" style={{ color: "var(--c-text)" }}>
            Sign in
          </h1>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* USER ID */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="erp-id"
              className="text-xs font-semibold uppercase tracking-[0.12em]"
              style={{ color: "var(--c-muted)" }}
            >
              User ID
            </label>
            <div
              className="flex items-center gap-2.5 rounded-[14px] border px-3.5 py-3 transition-colors focus-within:border-[var(--c-blue)]"
              style={{ background: "var(--c-s2)", borderColor: "var(--c-border)" }}
            >
              <User size={15} style={{ color: "var(--c-muted)", flexShrink: 0 }} />
              <input
                id="erp-id"
                type="text"
                autoComplete="username"
                placeholder="employee.id"
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--c-muted)]"
                style={{ color: "var(--c-text)" }}
              />
            </div>
          </div>

          {/* PASSWORD */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="erp-pw"
              className="text-xs font-semibold uppercase tracking-[0.12em]"
              style={{ color: "var(--c-muted)" }}
            >
              Password
            </label>
            <div
              className="flex items-center gap-2.5 rounded-[14px] border px-3.5 py-3 transition-colors focus-within:border-[var(--c-blue)]"
              style={{ background: "var(--c-s2)", borderColor: "var(--c-border)" }}
            >
              <Lock size={15} style={{ color: "var(--c-muted)", flexShrink: 0 }} />
              <input
                id="erp-pw"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--c-muted)]"
                style={{ color: "var(--c-text)" }}
              />
            </div>
          </div>

          {/* 로그인 버튼 */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-[14px] py-3 text-sm font-semibold text-white transition-opacity"
            style={{
              background: "var(--c-blue)",
              opacity: canSubmit ? 1 : 0.4,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                ENTER SYSTEM
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {/* 하단 */}
        <p className="mt-6 text-center text-xs" style={{ color: "var(--c-muted)" }}>
          © 2026 DEXCOWIN · ERP System
        </p>

      </div>
    </div>
  );
}
