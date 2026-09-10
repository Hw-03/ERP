"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Lock } from "lucide-react";
import { api, type Employee, type OperatorSessionResponse } from "@/lib/api";
import { operatorSessionApi } from "@/lib/api/operator-session";
import { ApiError } from "@/lib/api-core";
import { PIN_LENGTH } from "@/lib/auth/constants";
import {
  markLoginNotificationPopupPending,
  operatorFromEmployee,
  setCurrentOperator,
  type Operator,
} from "./useCurrentOperator";
import { useLoginEmployees } from "./useLoginEmployees";
import { EmployeeCombobox } from "./EmployeeCombobox";
import { runLoginReadWithRetry, validateAppSession } from "./loginReadRetry";
import styles from "./OperatorLoginCard.module.css";

interface OperatorLoginCardProps {
  onLogin: (session: OperatorSessionResponse) => void;
  logoutPending?: boolean;
  logoutRetrying?: boolean;
  onRetryLogout?: () => void;
}

export function OperatorLoginCard({
  onLogin,
  logoutPending = false,
  logoutRetrying = false,
  onRetryLogout,
}: OperatorLoginCardProps) {
  const employeeList = useLoginEmployees();
  const [selected, setSelected] = useState<Employee | null>(null);
  const [changingPin, setChangingPin] = useState(false);
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingOperator, setPendingOperator] = useState<Operator | null>(null);
  const [pendingSession, setPendingSession] = useState<OperatorSessionResponse | null>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  const disabled = loading || logoutPending || employeeList.status !== "ready";
  const canSubmit = !!selected && !disabled && (
    pendingOperator
      ? true
      : changingPin
        ? newPin.length === PIN_LENGTH && confirmPin.length === PIN_LENGTH
        : pin.length === PIN_LENGTH
  );

  useEffect(() => () => requestControllerRef.current?.abort(), []);

  const handlePinChange = (raw: string, setter: (value: string) => void) => {
    setter(raw.replace(/\D/g, "").slice(0, PIN_LENGTH));
    setPendingOperator(null);
    setPendingSession(null);
    if (error) setError("");
  };

  const completeLogin = useCallback(async (
    operator: Operator,
    operatorSession: OperatorSessionResponse,
  ) => {
    const controller = new AbortController();
    requestControllerRef.current?.abort();
    requestControllerRef.current = controller;
    try {
      const session = await runLoginReadWithRetry(
        (readSignal) => api.getAppSession(readSignal),
        { stage: "app_session", signal: controller.signal, validate: validateAppSession },
      );
      if (controller.signal.aborted) return;
      if (session.boot_id !== operatorSession.boot_id) {
        throw new Error("operator/app session boot mismatch");
      }
      if (operator.theme) {
        document.documentElement.classList.toggle("dark", operator.theme === "dark");
      }
      if (operator.loginPopupEnabled) {
        markLoginNotificationPopupPending(operator.employee_id);
      }
      setCurrentOperator(operator, session.boot_id);
      onLogin(operatorSession);
    } catch {
      if (controller.signal.aborted) return;
      setPendingOperator(operator);
      setPendingSession(operatorSession);
      setError("연결 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      if (requestControllerRef.current === controller && !controller.signal.aborted) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [onLogin]);

  const returnToLogin = (message = "") => {
    setChangingPin(false);
    setPendingOperator(null);
    setPendingSession(null);
    setPin("");
    setNewPin("");
    setConfirmPin("");
    setError(message);
    requestAnimationFrame(() => pinInputRef.current?.focus());
  };

  const revokeChallengeAndReturn = async (message = "") => {
    if (!selected) return;
    try {
      await operatorSessionApi.cancelPinChangeChallenge(selected.employee_id);
    } catch {
      setError("PIN 변경 취소를 서버에 반영하지 못했습니다. 다시 시도해 주세요.");
      return;
    }
    returnToLogin(message);
  };

  const cancelPinChange = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await revokeChallengeAndReturn();
    } finally {
      setLoading(false);
    }
  };

  const pinErrorMessage = (failure: unknown): string => {
    if (failure instanceof ApiError) {
      if (failure.code === "INVALID_CREDENTIALS") return "PIN 번호가 올바르지 않습니다.";
      if (failure.status === 429) return "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.";
      if (failure.status >= 500) return "서버 연결을 확인하지 못했습니다. 다시 시도해 주세요.";
      return failure.message || "로그인을 확인하지 못했습니다. 다시 시도해 주세요.";
    }
    return "서버 연결을 확인하지 못했습니다. 다시 시도해 주세요.";
  };

  const submit = async () => {
    if (!canSubmit || !selected) return;
    setLoading(true);
    setError("");
    if (pendingOperator && pendingSession) {
      await completeLogin(pendingOperator, pendingSession);
      return;
    }
    try {
      if (!changingPin) {
        try {
          const session = await operatorSessionApi.createOperatorSession(selected.employee_id, pin);
          await completeLogin(operatorFromEmployee(session.employee), session);
        } catch (failure) {
          if (failure instanceof ApiError && failure.code === "PIN_CHANGE_REQUIRED") {
            setChangingPin(true);
            setError("");
            setPin("");
          } else {
            setError(pinErrorMessage(failure));
            if (failure instanceof ApiError && (failure.status === 401 || failure.status === 403)) {
              setPin("");
              requestAnimationFrame(() => pinInputRef.current?.focus());
            }
          }
        }
        return;
      }
      if (newPin !== confirmPin) {
        setError("새 PIN과 확인 PIN이 일치하지 않습니다.");
        return;
      }
      let changed = false;
      try {
        await operatorSessionApi.completeOperatorPinChange(selected.employee_id, newPin);
        changed = true;
        const session = await operatorSessionApi.createOperatorSession(selected.employee_id, newPin);
        await completeLogin(operatorFromEmployee(session.employee), session);
      } catch (failure) {
        if (changed) {
          await revokeChallengeAndReturn("PIN은 변경되었습니다. 새 PIN으로 다시 로그인해 주세요.");
        } else if (failure instanceof ApiError && failure.status === 422) {
          setError(failure.message);
        } else {
          await revokeChallengeAndReturn("PIN 설정을 완료하지 못했습니다. 로그인부터 다시 시도해 주세요.");
        }
      }
    } finally {
      if (!requestControllerRef.current) setLoading(false);
    }
  };

  const pinFields: Array<{
    id: string;
    label: string;
    value: string;
    setter: (value: string) => void;
    inputRef?: typeof pinInputRef;
    autoComplete?: string;
  }> = changingPin
    ? [
        { id: "mes-new-pin", label: "새 PIN", value: newPin, setter: setNewPin },
        { id: "mes-confirm-pin", label: "새 PIN 확인", value: confirmPin, setter: setConfirmPin },
      ]
    : [{
        id: "mes-login-pin",
        label: "PIN 번호",
        value: pin,
        setter: setPin,
        inputRef: pinInputRef,
        autoComplete: "off",
      }];

  return (
    <div className={styles.root}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className={styles.card}
      >
        {logoutPending && (
          <div className={styles.pending}>
            <p role="alert">로그아웃 완료를 확인하지 못했습니다. 다시 시도해 주세요.</p>
            <button
              type="button"
              onClick={onRetryLogout}
              disabled={logoutRetrying}
              className={styles.link}
              data-loading={logoutRetrying}
            >
              {logoutRetrying ? "로그아웃 확인 중..." : "로그아웃 재시도"}
            </button>
          </div>
        )}
        <div className={styles.employee}>
          <EmployeeCombobox
            employees={employeeList.employees}
            value={selected}
            onChange={(employee) => {
              setSelected(employee);
              returnToLogin();
            }}
            autoFocus
            disabled={disabled || changingPin}
          />
          {employeeList.status === "loading" && (
            <p className="mt-2 text-sm" style={{ color: "var(--c-muted)" }}>직원 목록을 불러오는 중입니다.</p>
          )}
          {employeeList.status === "error" && (
            <p className="mt-2 text-sm" role="alert" style={{ color: "var(--c-red)" }}>
              직원 목록을 불러오지 못했습니다.{" "}
              <button type="button" onClick={employeeList.retry} className="underline">다시 시도</button>
            </p>
          )}
        </div>

        <div className={styles.fields} data-changing={changingPin}>
          {changingPin && <p>기본 PIN 대신 사용할 새 PIN을 설정해 주세요.</p>}
          {pinFields.map(({ id, label, value, setter, inputRef, autoComplete }) => (
            <div className={styles.field} key={id}>
              <label htmlFor={id}>{label}</label>
              <div className={styles.inputShell} data-error={!!error} data-loading={loading}>
                <Lock size={16} />
                <input
                  id={id}
                  ref={inputRef}
                  type="password"
                  inputMode="numeric"
                  autoComplete={autoComplete ?? "new-password"}
                  maxLength={PIN_LENGTH}
                  placeholder="숫자 4자리"
                  value={value}
                  onChange={(event) => handlePinChange(event.target.value, setter)}
                  disabled={disabled}
                />
              </div>
            </div>
          ))}
          {changingPin && (
            <button
              type="button"
              onClick={() => void cancelPinChange()}
              disabled={disabled}
              className={`${styles.link} ${styles.cancel}`}
              data-loading={loading}
            >
              로그인으로 돌아가기
            </button>
          )}
        </div>

        {error && <p className={styles.error} role="alert">{error}</p>}

        <div className={styles.submitWrap}>
          <button type="submit" disabled={!canSubmit} className={styles.submit} data-enabled={canSubmit}>
            {loading ? (
              <><Loader2 size={18} className="animate-spin" />확인 중...</>
            ) : (
              <>{pendingOperator ? "다시 시도" : changingPin ? "PIN 설정 및 로그인" : "로그인"}<ArrowRight size={18} /></>
            )}
          </button>
        </div>

        <div className={styles.footer}>
          <div>
            <p>사내 승인된 직원만 접근할 수 있습니다.</p>
            <p>모든 접속은 보안 정책에 따라 기록 및 관리됩니다.</p>
          </div>
        </div>
      </form>
    </div>
  );
}
