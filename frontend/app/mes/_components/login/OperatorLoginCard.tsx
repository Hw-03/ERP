"use client";

import { useRef, useState } from "react";
import { ArrowRight, Loader2, Lock } from "lucide-react";
import type { Employee, OperatorSessionResponse } from "@/lib/api";
import { operatorSessionApi } from "@/lib/api/operator-session";
import { ApiError } from "@/lib/api-core";
import { PIN_LENGTH } from "@/lib/auth/constants";
import {
  markLoginNotificationPopupPending,
  operatorFromEmployee,
  setCurrentOperator,
} from "./useCurrentOperator";
import { useLoginEmployees } from "./useLoginEmployees";
import { EmployeeCombobox } from "./EmployeeCombobox";
import styles from "./OperatorLoginCard.module.css";

interface OperatorLoginCardProps {
  onLogin: () => void;
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
  const employees = useLoginEmployees();
  const [selected, setSelected] = useState<Employee | null>(null);
  const [changingPin, setChangingPin] = useState(false);
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  const disabled = loading || logoutPending;
  const canSubmit = !!selected && !disabled && (
    changingPin
      ? newPin.length === PIN_LENGTH && confirmPin.length === PIN_LENGTH
      : pin.length === PIN_LENGTH
  );

  const handlePinChange = (raw: string, setter: (value: string) => void) => {
    setter(raw.replace(/\D/g, "").slice(0, PIN_LENGTH));
    if (error) setError("");
  };

  const finishLogin = (session: OperatorSessionResponse) => {
    const operator = operatorFromEmployee(session.employee);
    if (operator.theme) {
      document.documentElement.classList.toggle("dark", operator.theme === "dark");
    }
    if (operator.loginPopupEnabled) {
      markLoginNotificationPopupPending(operator.employee_id);
    }
    setCurrentOperator(operator, session.boot_id);
    onLogin();
  };

  const returnToLogin = (message = "") => {
    setChangingPin(false);
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

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      if (!changingPin) {
        try {
          finishLogin(
            await operatorSessionApi.createOperatorSession(selected!.employee_id, pin),
          );
        } catch (failure) {
          if (failure instanceof ApiError && failure.code === "PIN_CHANGE_REQUIRED") {
            setChangingPin(true);
            setError("");
          } else {
            setError(failure instanceof Error ? failure.message : "로그인에 실패했습니다.");
          }
          setPin("");
        }
        return;
      }
      if (newPin !== confirmPin) {
        setError("새 PIN과 확인 PIN이 일치하지 않습니다.");
        return;
      }
      let changed = false;
      try {
        await operatorSessionApi.completeOperatorPinChange(selected!.employee_id, newPin);
        changed = true;
        finishLogin(
          await operatorSessionApi.createOperatorSession(selected!.employee_id, newPin),
        );
      } catch (failure) {
        if (changed) {
          await revokeChallengeAndReturn(
            "PIN은 변경되었습니다. 새 PIN으로 다시 로그인해 주세요.",
          );
        } else if (failure instanceof ApiError && failure.status === 422) {
          setError(failure.message);
        } else {
          await revokeChallengeAndReturn(
            "PIN 설정을 완료하지 못했습니다. 로그인부터 다시 시도해 주세요.",
          );
        }
      }
    } finally {
      setLoading(false);
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
            <p role="alert">
              로그아웃을 서버에 반영하지 못했습니다. 재시도 전에는 로그인할 수 없습니다.
            </p>
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
            employees={employees}
            value={selected}
            onChange={(employee) => {
              setSelected(employee);
              returnToLogin();
            }}
            autoFocus
            disabled={disabled || changingPin}
          />
        </div>

        <div
          className={styles.fields}
          data-changing={changingPin}
        >
          {changingPin && (
            <p>
              기본 PIN 대신 사용할 새 PIN을 설정해 주세요.
            </p>
          )}
          {pinFields.map(({ id, label, value, setter, inputRef, autoComplete }) => (
            <div className={styles.field} key={id}>
              <label htmlFor={id}>
                {label}
              </label>
              <div
                className={styles.inputShell}
                data-error={!!error}
                data-loading={loading}
              >
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
          <button
            type="submit"
            disabled={!canSubmit}
            className={styles.submit}
            data-enabled={canSubmit}
          >
            {loading ? (
              <><Loader2 size={18} className="animate-spin" />확인 중...</>
            ) : (
              <>{changingPin ? "PIN 설정 및 로그인" : "로그인"}<ArrowRight size={18} /></>
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
