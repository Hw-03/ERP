"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OperatorSessionResponse } from "@/lib/api";
import { operatorSessionApi } from "@/lib/api/operator-session";
import {
  advanceAuthGeneration,
  ApiError,
  establishAuthRequiredBoundary,
  ResultUnknownError,
} from "@/lib/api-core";

const WARNING_MS = 60_000;
const ACTIVITY_THROTTLE_MS = 60_000;
const SESSION_RECHECK_TIMEOUT_MS = 8_000;
const ACTIVITY_SYNC_KEY = "dexcowin_mes_operator_activity";

interface UseOperatorIdleSessionOptions {
  session: OperatorSessionResponse | null;
  active: boolean;
  onExpired: (employeeId: string) => void;
}

interface OperatorIdleSessionState {
  warningSeconds: number | null;
  renewing: boolean;
  renewalError: string;
  renewNow: () => Promise<void>;
}

function clientDeadline(session: OperatorSessionResponse): number {
  const serverTime = Date.parse(session.server_time);
  const expiresAt = Date.parse(session.expires_at);
  if (!Number.isFinite(serverTime) || !Number.isFinite(expiresAt)) return Date.now();
  const receivedAt = Number.isFinite(session.client_received_at_ms)
    ? session.client_received_at_ms as number
    : Date.now();
  return receivedAt + Math.max(0, expiresAt - serverTime);
}

function sameSessionIdentity(
  left: OperatorSessionResponse | null,
  right: OperatorSessionResponse,
): boolean {
  return !!left
    && left.employee.employee_id === right.employee.employee_id
    && left.boot_id === right.boot_id;
}

function broadcastSessionSignal(session: OperatorSessionResponse): void {
  window.localStorage.setItem(
    ACTIVITY_SYNC_KEY,
    JSON.stringify({
      employee_id: session.employee.employee_id,
      boot_id: session.boot_id,
      nonce: `${Date.now()}-${Math.random()}`,
    }),
  );
}

function isTerminalActorError(error: unknown): error is ApiError {
  return error instanceof ApiError
    && error.status === 403
    && (error.code === "ACTOR_MISMATCH" || error.code === "EMPLOYEE_INACTIVE");
}

export function useOperatorIdleSession({
  session,
  active,
  onExpired,
}: UseOperatorIdleSessionOptions): OperatorIdleSessionState {
  const sessionRef = useRef<OperatorSessionResponse | null>(session);
  const deadlineRef = useRef(0);
  const expiredRef = useRef(false);
  const activeRef = useRef(active);
  const warningRef = useRef<number | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const expiryCheckRef = useRef<Promise<void> | null>(null);
  const nextAutomaticRenewalRef = useRef(0);
  const trailingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSequenceRef = useRef(0);
  const recheckSequenceRef = useRef(0);
  const recheckControllersRef = useRef(new Set<AbortController>());
  const sessionVersionRef = useRef(0);
  const expiryUncertainRef = useRef(false);
  const identityRecheckRequiredRef = useRef(false);
  const deadlineBoundaryRef = useRef(false);
  const [deadlineRevision, setDeadlineRevision] = useState(0);
  const [warningSeconds, setWarningSeconds] = useState<number | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [renewalError, setRenewalError] = useState("");

  activeRef.current = active;
  warningRef.current = warningSeconds;

  const acceptSession = useCallback((next: OperatorSessionResponse, broadcast: boolean) => {
    if (!sameSessionIdentity(sessionRef.current, next)) return false;
    sessionRef.current = next;
    sessionVersionRef.current += 1;
    deadlineRef.current = clientDeadline(next);
    expiredRef.current = false;
    expiryUncertainRef.current = false;
    identityRecheckRequiredRef.current = false;
    deadlineBoundaryRef.current = false;
    nextAutomaticRenewalRef.current = Date.now() + ACTIVITY_THROTTLE_MS;
    warningRef.current = null;
    setWarningSeconds(null);
    setRenewalError("");
    setDeadlineRevision((value) => value + 1);
    if (broadcast) broadcastSessionSignal(next);
    return true;
  }, []);

  useEffect(() => {
    requestSequenceRef.current += 1;
    recheckSequenceRef.current += 1;
    sessionVersionRef.current += 1;
    sessionRef.current = session;
    deadlineRef.current = session ? clientDeadline(session) : 0;
    expiredRef.current = false;
    expiryUncertainRef.current = false;
    identityRecheckRequiredRef.current = false;
    deadlineBoundaryRef.current = false;
    nextAutomaticRenewalRef.current = 0;
    warningRef.current = null;
    setWarningSeconds(null);
    setRenewalError("");
    setDeadlineRevision((value) => value + 1);
    if (session) broadcastSessionSignal(session);
  }, [session]);

  const fetchSessionForIdleCheck = useCallback(async (): Promise<OperatorSessionResponse> => {
    const controller = new AbortController();
    recheckControllersRef.current.add(controller);
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      SESSION_RECHECK_TIMEOUT_MS,
    );
    try {
      return await operatorSessionApi.getOperatorSessionForIdleCheck(controller.signal);
    } finally {
      window.clearTimeout(timeoutId);
      recheckControllersRef.current.delete(controller);
    }
  }, []);

  const recheckServerSession = useCallback(async (
    lockUntilVerified = false,
  ): Promise<boolean> => {
    const expected = sessionRef.current;
    if (!expected) return false;
    const sequence = ++recheckSequenceRef.current;
    const expectedVersion = sessionVersionRef.current;
    const requestStartedAt = Date.now();
    const keepMasked = lockUntilVerified || identityRecheckRequiredRef.current;
    if (keepMasked) setRenewing(true);
    try {
      const verified = await fetchSessionForIdleCheck();
      if (
        sequence !== recheckSequenceRef.current
        ||
        expectedVersion !== sessionVersionRef.current
        || !sameSessionIdentity(sessionRef.current, expected)
      ) return false;
      if (!sameSessionIdentity(expected, verified)) {
        expiredRef.current = true;
        establishAuthRequiredBoundary("server");
        return false;
      }
      return acceptSession(
        { ...verified, client_received_at_ms: requestStartedAt },
        false,
      );
    } catch (error) {
      if (
        sequence === recheckSequenceRef.current
        &&
        expectedVersion === sessionVersionRef.current
        && sameSessionIdentity(sessionRef.current, expected)
      ) {
        if (error instanceof ApiError && error.status === 401) {
          expiredRef.current = true;
          onExpired(expected.employee.employee_id);
        } else if (isTerminalActorError(error)) {
          expiredRef.current = true;
          establishAuthRequiredBoundary("server");
        } else if (keepMasked) {
          identityRecheckRequiredRef.current = true;
          warningRef.current = 0;
          setWarningSeconds(0);
          setRenewalError("다른 탭의 로그인 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
        }
      }
      return false;
    } finally {
      if (keepMasked && sequence === recheckSequenceRef.current) {
        setRenewing(false);
      }
    }
  }, [acceptSession, fetchSessionForIdleCheck, onExpired]);

  const performRenewal = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;
    const expected = sessionRef.current;
    if (!activeRef.current || !expected) return;
    const sequence = ++requestSequenceRef.current;
    const expectedVersion = sessionVersionRef.current;
    const requestStartedAt = Date.now();
    setRenewing(true);
    const request = (async () => {
      try {
        const renewed = await operatorSessionApi.renewOperatorSession();
        if (
          sequence !== requestSequenceRef.current
          || expectedVersion !== sessionVersionRef.current
          || !sameSessionIdentity(expected, renewed)
        ) return;
        acceptSession({ ...renewed, client_received_at_ms: requestStartedAt }, true);
      } catch (error) {
        if (error instanceof ResultUnknownError && await recheckServerSession()) return;
        if (
          sequence !== requestSequenceRef.current
          || expectedVersion !== sessionVersionRef.current
          || expiredRef.current
          || !sameSessionIdentity(sessionRef.current, expected)
        ) return;
        if (error instanceof ApiError && error.status === 401) {
          expiredRef.current = true;
          onExpired(expected.employee.employee_id);
          return;
        }
        if (isTerminalActorError(error)) {
          expiredRef.current = true;
          establishAuthRequiredBoundary("server");
          return;
        }
        setRenewalError("로그인 유지 여부를 확인하지 못했습니다. 다시 시도해 주세요.");
      }
    })().finally(() => {
      if (inFlightRef.current === request) inFlightRef.current = null;
      setRenewing(false);
    });
    inFlightRef.current = request;
    return request;
  }, [acceptSession, onExpired, recheckServerSession]);

  const requestAutomaticRenewal = useCallback(() => {
    if (!activeRef.current || warningRef.current !== null || !sessionRef.current) return;
    const delay = nextAutomaticRenewalRef.current - Date.now();
    if (delay <= 0) {
      void performRenewal();
      return;
    }
    if (trailingTimerRef.current) return;
    trailingTimerRef.current = setTimeout(() => {
      trailingTimerRef.current = null;
      if (warningRef.current === null) void performRenewal();
    }, delay);
  }, [performRenewal]);

  const verifyServerAtDeadline = useCallback(async (): Promise<void> => {
    if (expiryCheckRef.current) return expiryCheckRef.current;
    const expected = sessionRef.current;
    if (!activeRef.current || !expected) return;
    const expectedVersion = sessionVersionRef.current;
    setRenewing(true);
    setRenewalError("");
    const request = (async () => {
      const pendingRenewal = inFlightRef.current;
      if (pendingRenewal) await pendingRenewal;
      const current = sessionRef.current;
      if (
        !activeRef.current
        || expiredRef.current
        || !current
        || expectedVersion !== sessionVersionRef.current
        || !sameSessionIdentity(expected, current)
        || deadlineRef.current > Date.now()
      ) return;
      try {
        const requestStartedAt = Date.now();
        const verified = await fetchSessionForIdleCheck();
        if (
          expectedVersion !== sessionVersionRef.current
          || !sameSessionIdentity(sessionRef.current, current)
        ) return;
        if (!sameSessionIdentity(current, verified)) {
          expiredRef.current = true;
          onExpired(current.employee.employee_id);
          return;
        }
        acceptSession(
          { ...verified, client_received_at_ms: requestStartedAt },
          false,
        );
      } catch (error) {
        if (
          expectedVersion !== sessionVersionRef.current
          || !sameSessionIdentity(sessionRef.current, current)
        ) return;
        if (error instanceof ApiError && error.status === 401) {
          expiredRef.current = true;
          onExpired(current.employee.employee_id);
          return;
        }
        if (isTerminalActorError(error)) {
          expiredRef.current = true;
          establishAuthRequiredBoundary("server");
          return;
        }
        expiryUncertainRef.current = true;
        setRenewalError("로그인 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
      }
    })().finally(() => {
      if (expiryCheckRef.current === request) expiryCheckRef.current = null;
      setRenewing(false);
    });
    expiryCheckRef.current = request;
    return request;
  }, [acceptSession, fetchSessionForIdleCheck, onExpired]);

  const renewNow = useCallback(async () => {
    if (!activeRef.current || !sessionRef.current) return;
    if (trailingTimerRef.current) {
      clearTimeout(trailingTimerRef.current);
      trailingTimerRef.current = null;
    }
    if (warningRef.current === 0) {
      if (identityRecheckRequiredRef.current) {
        setRenewalError("");
        await recheckServerSession(true);
        return;
      }
      expiryUncertainRef.current = false;
      await verifyServerAtDeadline();
      return;
    }
    await performRenewal();
  }, [performRenewal, recheckServerSession, verifyServerAtDeadline]);

  const checkDeadline = useCallback(() => {
    const current = sessionRef.current;
    if (!activeRef.current || !current || expiredRef.current) return;
    if (identityRecheckRequiredRef.current) {
      warningRef.current = 0;
      setWarningSeconds(0);
      return;
    }
    const remaining = deadlineRef.current - Date.now();
    if (remaining <= 0) {
      if (!deadlineBoundaryRef.current) {
        deadlineBoundaryRef.current = true;
        requestSequenceRef.current += 1;
        recheckSequenceRef.current += 1;
        sessionVersionRef.current += 1;
        advanceAuthGeneration();
      }
      warningRef.current = 0;
      setWarningSeconds(0);
      if (!expiryUncertainRef.current) void verifyServerAtDeadline();
      return;
    }
    if (remaining <= WARNING_MS) {
      const seconds = Math.ceil(remaining / 1_000);
      warningRef.current = seconds;
      setWarningSeconds(seconds);
    } else if (warningRef.current !== null) {
      warningRef.current = null;
      setWarningSeconds(null);
    }
  }, [verifyServerAtDeadline]);

  useEffect(() => {
    if (!active || !session) return;
    checkDeadline();
    const interval = window.setInterval(checkDeadline, 1_000);
    const deadlineTimer = window.setTimeout(
      checkDeadline,
      Math.max(0, deadlineRef.current - Date.now()),
    );
    const checkAfterResume = () => checkDeadline();
    window.addEventListener("focus", checkAfterResume);
    document.addEventListener("visibilitychange", checkAfterResume);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(deadlineTimer);
      window.removeEventListener("focus", checkAfterResume);
      document.removeEventListener("visibilitychange", checkAfterResume);
    };
  }, [active, checkDeadline, deadlineRevision, session]);

  useEffect(() => {
    if (!active || !session) return;
    const recordActivity = () => requestAutomaticRenewal();
    window.addEventListener("click", recordActivity, true);
    window.addEventListener("keydown", recordActivity, true);
    window.addEventListener("scroll", recordActivity, { capture: true, passive: true });
    return () => {
      window.removeEventListener("click", recordActivity, true);
      window.removeEventListener("keydown", recordActivity, true);
      window.removeEventListener("scroll", recordActivity, true);
    };
  }, [active, requestAutomaticRenewal, session]);

  useEffect(() => {
    if (!active || !session) return;
    const syncOtherTab = (event: StorageEvent) => {
      if (event.key !== ACTIVITY_SYNC_KEY || !event.newValue) return;
      let signal: { employee_id?: string; boot_id?: string };
      try {
        signal = JSON.parse(event.newValue) as typeof signal;
      } catch {
        return;
      }
      const current = sessionRef.current;
      if (
        !current
        || typeof signal.employee_id !== "string"
        || typeof signal.boot_id !== "string"
      ) return;
      const signalMatches = signal.employee_id === current.employee.employee_id
        && signal.boot_id === current.boot_id;
      if (!signalMatches) {
        requestSequenceRef.current += 1;
        recheckSequenceRef.current += 1;
        sessionVersionRef.current += 1;
        identityRecheckRequiredRef.current = true;
        deadlineBoundaryRef.current = true;
        warningRef.current = 0;
        setWarningSeconds(0);
        setRenewalError("");
        advanceAuthGeneration();
      }
      void recheckServerSession(!signalMatches);
    };
    window.addEventListener("storage", syncOtherTab);
    return () => window.removeEventListener("storage", syncOtherTab);
  }, [active, recheckServerSession, session]);

  useEffect(() => () => {
    requestSequenceRef.current += 1;
    recheckSequenceRef.current += 1;
    sessionVersionRef.current += 1;
    for (const controller of recheckControllersRef.current) controller.abort();
    recheckControllersRef.current.clear();
    if (trailingTimerRef.current) clearTimeout(trailingTimerRef.current);
  }, []);

  return { warningSeconds, renewing, renewalError, renewNow };
}
