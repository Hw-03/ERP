import { ApiError } from "@/lib/api-core";

export const LOGIN_READ_TIMEOUT_MS = 8_000;
export const LOGIN_READ_RETRY_DELAY_MS = 500;

type LoginReadStage = "app_session" | "active_employees";

interface LoginReadOptions<T> {
  stage: LoginReadStage;
  signal?: AbortSignal;
  validate?: (value: T) => T;
}

class LoginReadTimeoutError extends Error {
  constructor() {
    super("로그인 조회 시간 초과");
    this.name = "LoginReadTimeoutError";
  }
}

function getStatus(error: unknown): number | null {
  if (error instanceof ApiError) return error.status;
  return typeof error === "object" && error !== null && typeof (error as { status?: unknown }).status === "number"
    ? (error as { status: number }).status
    : null;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

function shouldRetry(error: unknown): boolean {
  const status = getStatus(error);
  return error instanceof LoginReadTimeoutError
    || (status !== null && status >= 500)
    || (status === null && !isAbortError(error) && !(error instanceof SyntaxError));
}

function errorKind(error: unknown): string {
  if (error instanceof LoginReadTimeoutError) return "timeout";
  if (isAbortError(error)) return "aborted";
  if (error instanceof SyntaxError) return "invalid_response";
  const status = getStatus(error);
  if (status !== null) return "http";
  return "network";
}

function abortError(): DOMException {
  return new DOMException("로그인 조회가 취소되었습니다.", "AbortError");
}

function waitFor(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(done, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    function done() {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function runAttempt<T>(operation: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new LoginReadTimeoutError());
      controller.abort();
    }, LOGIN_READ_TIMEOUT_MS);
  });
  const cancellation = new Promise<never>((_, reject) => {
    if (!signal) return;
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    signal.addEventListener("abort", () => reject(abortError()), { once: true });
  });
  try {
    return await Promise.race([
      operation(controller.signal),
      timeout,
      cancellation,
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abort);
    controller.abort();
  }
}

/** 로그인에 필요한 읽기 요청만 제한 시간과 1회 재시도를 적용한다. */
export async function runLoginReadWithRetry<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  { stage, signal, validate }: LoginReadOptions<T>,
): Promise<T> {
  let lastError: unknown;
  let attempts = 0;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    attempts = attempt;
    try {
      const value = await runAttempt(operation, signal);
      return validate ? validate(value) : value;
    } catch (error) {
      lastError = error;
      if (isAbortError(error) || attempt === 2 || !shouldRetry(error)) break;
      await waitFor(LOGIN_READ_RETRY_DELAY_MS, signal);
    }
  }
  if (isAbortError(lastError)) throw lastError;
  const status = getStatus(lastError);
  console.warn("[MES login] read failed", {
    stage,
    error_kind: errorKind(lastError),
    status,
    attempts,
  });
  throw lastError;
}

/** app-session 응답의 서버 재시작 식별자가 없으면 로그인 상태를 신뢰하지 않는다. */
export function validateAppSession<T extends { boot_id?: unknown }>(value: T): T {
  if (typeof value?.boot_id !== "string" || !value.boot_id.trim()) {
    throw new SyntaxError("app-session 응답 형식이 올바르지 않습니다.");
  }
  return value;
}

/** 활성 직원 목록은 배열이어야 하며, 그 외 응답은 빈 목록으로 해석하지 않는다. */
export function validateActiveEmployees<T>(value: T): T {
  if (!Array.isArray(value)) {
    throw new SyntaxError("active employees 응답 형식이 올바르지 않습니다.");
  }
  return value;
}
