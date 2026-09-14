"use client";

/**
 * 작업자 식별용 PIN 로그인 카드 — 단일 카드 구조.
 *
 * 로그인된 작업자 정보는 입출고/수정 작업의 produced_by 기본값으로 사용된다.
 * 실제 보안 인증이 아닌 식별용.
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Loader2, Lock } from "lucide-react";
import { api, type Employee } from "@/lib/api";
import { ApiError } from "@/lib/api-core";
import { PIN_LENGTH } from "@/lib/auth/constants";
import { normalizeSidebarMode } from "@/lib/sidebar-mode";
import { markLoginNotificationPopupPending, setCurrentOperator, type Operator } from "./useCurrentOperator";
import { useLoginEmployees } from "./useLoginEmployees";
import { EmployeeCombobox } from "./EmployeeCombobox";
import { runLoginReadWithRetry, validateAppSession } from "./loginReadRetry";

interface OperatorLoginCardProps {
  onLogin: () => void;
}

export function OperatorLoginCard({ onLogin }: OperatorLoginCardProps) {
  const employeeList = useLoginEmployees();
  const [selected, setSelected] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingOperator, setPendingOperator] = useState<Operator | null>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  const canSubmit = !!selected && pin.length === PIN_LENGTH && !loading && employeeList.status === "ready";

  useEffect(() => () => requestControllerRef.current?.abort(), []);

  const handlePinChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, PIN_LENGTH);
    setPin(digits);
    setPendingOperator(null);
    if (error) setError("");
  };

  const completeLogin = useCallback(async (op: Operator) => {
    const controller = new AbortController();
    requestControllerRef.current?.abort();
    requestControllerRef.current = controller;
    try {
      const session = await runLoginReadWithRetry(
        (readSignal) => api.getAppSession(readSignal),
        { stage: "app_session", signal: controller.signal, validate: validateAppSession },
      );
      if (controller.signal.aborted) return;
      if (op.theme && typeof document !== "undefined") {
        if (op.theme === "dark") document.documentElement.classList.add("dark");
        else if (op.theme === "light") document.documentElement.classList.remove("dark");
      }
      if (op.loginPopupEnabled) markLoginNotificationPopupPending(op.employee_id);
      setCurrentOperator(op, session.boot_id);
      onLogin();
    } catch (failure) {
      if (controller.signal.aborted) return;
      setPendingOperator(op);
      setError("연결 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      if (requestControllerRef.current === controller && !controller.signal.aborted) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [onLogin]);

  const pinErrorMessage = (failure: unknown): string => {
    if (failure instanceof ApiError) {
      if (failure.status === 403) return "PIN 번호가 올바르지 않습니다.";
      if (failure.status === 429) return "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.";
      if (failure.status >= 500) return "서버 연결을 확인하지 못했습니다. 다시 시도해 주세요.";
      return failure.message || "로그인을 확인하지 못했습니다. 다시 시도해 주세요.";
    }
    return "서버 연결을 확인하지 못했습니다. 다시 시도해 주세요.";
  };

  const submit = useCallback(async () => {
    if (!selected || pin.length !== PIN_LENGTH || loading) return;
    setLoading(true);
    setError("");
    if (pendingOperator) {
      await completeLogin(pendingOperator);
      return;
    }
    try {
      const emp = await api.verifyEmployeePin(selected.employee_id, pin);
      const op: Operator = {
        employee_id: emp.employee_id,
        name: emp.name,
        role: emp.role,
        department: emp.department,
        level: emp.level,
        employee_code: emp.employee_code,
        warehouse_role: emp.warehouse_role ?? "none",
        department_role: emp.department_role ?? "none",
        theme: emp.theme ?? null,
        sidebar_mode: normalizeSidebarMode(emp.sidebar_mode) ?? "hover",
        assigned_model_slots: emp.assigned_model_slots ?? [],
        io_enabled: emp.io_enabled ?? true,
        hidden_sidebar_tabs: emp.hidden_sidebar_tabs ?? [],
        loginPopupEnabled: emp.login_notification_popup_enabled ?? true,
      };

      await completeLogin(op);
    } catch (failure) {
      setError(pinErrorMessage(failure));
      if (failure instanceof ApiError && failure.status === 403) {
        setPin("");
        requestAnimationFrame(() => pinInputRef.current?.focus());
      }
    } finally {
      if (!requestControllerRef.current) setLoading(false);
    }
  }, [completeLogin, loading, pendingOperator, pin, selected]);

  const handlePinKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && canSubmit) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 440, padding: "0 16px" }}>
      <div
        className="relative flex w-full flex-col rounded-[24px] border"
        style={{
          background: "var(--c-s1)",
          borderColor: "var(--c-border)",
          boxShadow: "var(--c-card-shadow)",
          padding: "40px 36px 32px",
        }}
      >
        {/* 직원 선택 — 드롭다운이 형제 필드들 위에 오도록 stacking 보장 */}
        <div
          style={{
            animation: "mes-field-rise 0.5s 0.05s ease both",
            position: "relative",
            zIndex: 30,
          }}
        >
          <EmployeeCombobox
            employees={employeeList.employees}
            value={selected}
            onChange={(emp) => {
              setSelected(emp);
              setPin("");
              setPendingOperator(null);
              setError("");
              // 직원 선택 직후 PIN 입력으로 흐름 자동 연결
              requestAnimationFrame(() => pinInputRef.current?.focus());
            }}
            autoFocus
            disabled={loading || employeeList.status !== "ready"}
          />
          {employeeList.status === "loading" && (
            <p className="mt-2 text-sm" style={{ color: "var(--c-muted)" }}>직원 목록을 불러오는 중입니다.</p>
          )}
          {employeeList.status === "error" && (
            <p className="mt-2 text-sm" role="alert" style={{ color: "var(--c-red)" }}>
              직원 목록을 불러오지 못했습니다. <button type="button" onClick={employeeList.retry} className="underline">다시 시도</button>
            </p>
          )}
        </div>

        {/* PIN 입력 */}
        <div
          className="mt-5"
          style={{ animation: "mes-field-rise 0.5s 0.15s ease both" }}
        >
          <label
            htmlFor="mes-login-pin"
            className="mb-2 block text-sm font-semibold"
            style={{ color: "var(--c-text)" }}
          >
            PIN 번호
          </label>
          <div
            className="flex items-center gap-3 rounded-[14px] border px-4 py-3.5 transition-colors focus-within:border-[var(--c-blue)]"
            style={{
              background: "var(--c-s2)",
              borderColor: error ? "var(--c-red)" : "var(--c-border)",
              opacity: loading ? 0.6 : 1,
            }}
          >
            <Lock size={16} style={{ color: "var(--c-muted)", flexShrink: 0 }} />
            <input
              id="mes-login-pin"
              ref={pinInputRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={PIN_LENGTH}
              placeholder="숫자 4자리"
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              onKeyDown={handlePinKey}
              disabled={loading || employeeList.status !== "ready"}
              className="min-w-0 flex-1 bg-transparent text-base tracking-[0.4em] outline-none placeholder:tracking-normal placeholder:text-[var(--c-muted)]"
              style={{ color: "var(--c-text)" }}
            />
          </div>
          {error && (
            <p
              className="mt-2 text-sm"
              role="alert"
              style={{ color: "var(--c-red)" }}
            >
              {error}
            </p>
          )}
        </div>

        {/* 로그인 버튼 — wrapper 가 애니메이션, 버튼 inline opacity 보존 */}
        <div
          className="mt-6"
          style={{ animation: "mes-field-rise 0.5s 0.25s ease both" }}
        >
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] py-3.5 text-base font-semibold text-white transition-all"
            style={{
              background: "var(--c-blue)",
              opacity: canSubmit ? 1 : 0.45,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                확인 중...
              </>
            ) : (
              <>
                {pendingOperator ? "다시 시도" : "로그인"}
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>

        {/* 하단 보안 안내 */}
        <div
          className="mt-7 border-t pt-5"
          style={{
            borderColor: "var(--c-border)",
            animation: "mes-field-rise 0.5s 0.35s ease both",
          }}
        >
          <div
            className="text-center text-xs leading-relaxed"
            style={{ color: "var(--c-muted)" }}
          >
            <p>사내 승인된 직원만 접근할 수 있습니다.</p>
            <p>모든 접속은 보안 정책에 따라 기록 및 관리됩니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
