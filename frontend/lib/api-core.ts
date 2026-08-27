/**
 * DEXCOWIN MES 프론트엔드 API 코어
 *
 * 거대한 lib/api.ts 의 분할 1단계 — fetch wrapper / URL 빌더 / 에러 파서만 분리.
 * 도메인별 API (api 객체 본체) 와 타입 정의는 이번 PR 에서 이동하지 않는다.
 *
 * 호환:
 *   - lib/api.ts 가 본 모듈을 import 해서 동일한 이름으로 re-export 한다.
 *   - 외부 모듈은 종전처럼 `@/lib/api` 에서 import 해도 된다.
 *   - 새로 작성하는 코드는 `@/lib/api-core` 직접 사용을 권장.
 */

import { getAuditRequestHeaders } from "./activity-audit-context";
import { readCurrentEmployeeCodeForLog } from "./operator-log-context";

const SERVER_API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}`
  : "";

// 외부에서 명시적으로 base URL 이 필요할 때 (예: 테스트, 디버그) 사용.
export const FALLBACK_SERVER_API_BASE = "http://127.0.0.1:8000";

/**
 * 백엔드 API 절대/상대 URL 빌더.
 *   - NEXT_PUBLIC_API_URL 이 설정되어 있으면 그 값을 그대로 prefix.
 *   - 없으면 상대 경로 — Next.js rewrites 가 백엔드로 forward.
 */
export function toApiUrl(path: string): string {
  if (SERVER_API_BASE) {
    return `${SERVER_API_BASE}${path}`;
  }
  return path;
}

/** 백엔드 detail 구조에서 사용자 표시용 메시지 추출.
 *
 * 지원하는 detail 모양:
 * - 문자열: "품목을 찾을 수 없습니다."
 * - 구 dict: {message, shortages?}
 * - 신 dict (Phase 4): {code, message, extra?: {shortages?}}
 * - Pydantic 검증 에러 배열: [{loc: [...], msg: "...", type: "..."}]
 *
 * shortages 가 있으면 줄바꿈으로 추가한다.
 */
/** HTTP 에러 상태 코드를 보존하는 API 에러 클래스. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly extra?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
  get isConflict(): boolean { return this.status === 409; }
  get isUnavailable(): boolean { return this.status === 503; }
}

/** 쓰기 요청의 연결 거절·시간 초과를 구분하는 오류 클래스. */
export class ResultUnknownError extends Error {
  constructor() { super("연결 실패"); }
}

/** 기존 연결 오류 계약과 전송 결과 불명 오류를 같은 전용 타입으로 유지한다. */
export { ResultUnknownError as ApiConnectionError };

export function extractErrorMessage(detail: unknown, fallback = "처리 실패"): string {
  if (typeof detail === "string") return detail;
  // Pydantic 스키마 검증 실패는 detail 이 배열 — [{loc, msg, type, ...}]. 첫 항목의 msg 사용,
  // "Value error, " prefix 는 백엔드 raw 메시지라 제거해 사람 말로 보이게 한다.
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (first && typeof first === "object") {
      const raw = (first as Record<string, unknown>).msg;
      if (typeof raw === "string" && raw.trim()) {
        return raw.replace(/^Value error,\s*/i, "");
      }
    }
    return fallback;
  }
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    const msg = typeof d.message === "string" ? d.message : null;
    if (!msg) return fallback;

    let shortages: unknown = d.shortages;
    if (!Array.isArray(shortages) && d.extra && typeof d.extra === "object") {
      shortages = (d.extra as Record<string, unknown>).shortages;
    }
    const tail = Array.isArray(shortages) && shortages.length
      ? `\n${shortages.join("\n")}`
      : "";
    return `${msg}${tail}`;
  }
  return fallback;
}

/**
 * Response 가 실패 상태일 때 detail 을 추출해 사용자 표시용 메시지로 변환.
 * 외부에서 직접 fetch 를 사용하는 도메인 코드가 동일 메시지 포맷을 쓰도록 export.
 */
export async function parseError(res: Response): Promise<string> {
  return (await parseApiError(res)).message;
}

interface ParsedApiError {
  message: string;
  code?: string;
  extra?: unknown;
}

async function parseApiError(res: Response): Promise<ParsedApiError> {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text);
    const detail = json?.detail;
    const parsed: ParsedApiError = {
      message: extractErrorMessage(detail, text || res.statusText),
    };
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const record = detail as Record<string, unknown>;
      if (typeof record.code === "string") parsed.code = record.code;
      if (record.extra !== undefined) parsed.extra = record.extra;
    }
    return parsed;
  } catch {
    return { message: text || res.statusText };
  }
}

export const AUTH_REQUIRED_EVENT = "dexcowin_auth_required";

let authGeneration = 0;

/** 현재 탭의 인증 세대. 요청 시작 시 캡처해 지연된 401인지 판별한다. */
export function captureAuthGeneration(): number {
  return authGeneration;
}

/** 서버가 검증한 새 작업자 세션을 화면에 채택했음을 기록한다. */
export function advanceAuthGeneration(): void {
  if (typeof window === "undefined") return;
  authGeneration += 1;
}

/** 명시적 logout/PIN revoke 경계를 열고 actor-scoped UI 상태를 폐기한다. */
export function establishAuthRequiredBoundary(): void {
  if (typeof window === "undefined") return;
  advanceAuthGeneration();
  window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
}

export async function apiErrorFromResponse(
  res: Response,
  requestAuthGeneration: number,
): Promise<ApiError> {
  const parsed = await parseApiError(res);
  if (
    (res.status === 401 || (res.status === 403 && parsed.code === "ACTOR_MISMATCH")) &&
    requestAuthGeneration === authGeneration
  ) {
    establishAuthRequiredBoundary();
  }
  return new ApiError(parsed.message, res.status, parsed.code, parsed.extra);
}

/**
 * Admin PIN 자동 헤더 주입 — W3-B seam.
 *
 * `AdminSessionProvider` 가 mount 시점에 `registerAdminPinProvider(() => pin)`
 * 으로 콜백을 등록한다. 이후 모든 fetcher / writeJson 호출은 현재 PIN 이
 * 존재하면 자동으로 `X-Admin-Pin` 헤더를 주입한다.
 *
 * - 호출자 코드 변경 0 — 기존 body.pin 페이로드도 그대로 동작.
 * - 백엔드 admin 라우터는 `X-Admin-Pin` → `body.pin` 우선순위로
 *   PIN 을 추출 (W3-A 완료). 다른 라우터는 헤더 무시.
 * - in-memory only — sessionStorage / localStorage 사용 안 함.
 */
let getAdminPin: () => string | null = () => null;

export function registerAdminPinProvider(fn: () => string | null): void {
  getAdminPin = fn;
}

function adminPinHeaders(): Record<string, string> {
  const pin = getAdminPin();
  return pin ? { "X-Admin-Pin": pin } : {};
}

/**
 * 창고 관리자(operator) 자격증명 헤더 주입 — 창고 지도 편집용.
 *
 * 창고 지도 편집 모드 진입 시 `registerOperatorCredsProvider(() => ({code, pin}))`
 * 로 등록한다. warehouse-map mutation 엔드포인트는 `X-Employee-Code` +
 * `X-Operator-Pin` 으로 현재 세션 actor의 warehouse_role(primary/deputy)과 PIN을
 * 검증한다. PIN은 GET 요청에 보내지 않는다.
 * in-memory only — sessionStorage / localStorage 사용 안 함.
 */
let getOperatorCreds: () => { code: string; pin: string } | null = () => null;

export function registerOperatorCredsProvider(
  fn: () => { code: string; pin: string } | null,
): void {
  getOperatorCreds = fn;
}

function apiPathname(url: string): string | null {
  try {
    return new URL(url, "http://local.invalid").pathname;
  } catch {
    return null;
  }
}

/** 해당 mutation 범위에 맞는 in-memory step-up 자격증명만 더한다. */
function mutationAuthHeaders(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
): Record<string, string> {
  const pathname = apiPathname(url);
  const headers = adminPinHeaders();
  if (
    pathname !== "/api/operator-session/complete-pin-change" &&
    !(pathname === "/api/operator-session" && method === "POST")
  ) {
    const employeeCode = readCurrentEmployeeCodeForLog();
    if (employeeCode) headers["X-MES-Employee-Code"] = employeeCode;
  }
  if (
    pathname &&
    (pathname === "/api/warehouse-map" || pathname.startsWith("/api/warehouse-map/"))
  ) {
    const creds = getOperatorCreds();
    if (creds) {
      headers["X-Employee-Code"] = creds.code;
      headers["X-Operator-Pin"] = creds.pin;
    }
  }
  return headers;
}

function rethrowGetRequestError(error: unknown, url: string): never {
  if ((error as Error)?.name === "AbortError") throw error;
  throw new Error(
    error instanceof Error
      ? `API 연결에 실패했습니다. ${url} 주소에 접근할 수 있는지 확인해 주세요.`
      : "API 연결에 실패했습니다.",
  );
}

/**
 * 일반 GET 페치 — JSON 응답 반환. AbortSignal 지원.
 */
async function readResponse<T>(
  url: string,
  signal: AbortSignal | undefined,
  reader: "json" | "blob",
): Promise<T> {
  const requestAuthGeneration = captureAuthGeneration();
  let res: Response;
  try {
    const headers = adminPinHeaders();
    const init: RequestInit = { signal, credentials: "include" };
    if (Object.keys(headers).length > 0) init.headers = headers;
    res = await fetch(url, init);
  } catch (error) {
    rethrowGetRequestError(error, url);
  }
  if (!res.ok) {
    throw await apiErrorFromResponse(res, requestAuthGeneration);
  }
  return res[reader]() as Promise<T>;
}

export function fetcher<T>(url: string, signal?: AbortSignal): Promise<T> {
  return readResponse<T>(url, signal, "json");
}

/** 인증 헤더를 포함해 파일 응답을 Blob 으로 내려받는다. */
export function fetchBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  return readResponse<Blob>(url, signal, "blob");
}

/**
 * 쓰기 응답 캐스팅을 한 곳으로 — POST/PUT/PATCH/DELETE 공통.
 * 외부에서는 postJson / putJson / patchJson / deleteJson 사용.
 *
 * body 미지정(undefined) 시 Content-Type 헤더와 body 자체를 생략 — POST no-body
 * 엔드포인트(예: confirm/cancel queue, scan alerts)와 DELETE 호환.
 *
 * 응답이 204 No Content 거나 빈 본문이면 undefined 반환 — void 시그니처 호환.
 */
async function writeJson<T>(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
  callerSignal?: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const requestAuthGeneration = captureAuthGeneration();
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timeoutId = setTimeout(
    () => controller.abort(new Error("Request timed out")),
    15_000,
  );
  const init: RequestInit = {
    method,
    credentials: "include",
    signal: controller.signal,
  };
  const pinHeaders = {
    ...mutationAuthHeaders(url, method),
    ...getAuditRequestHeaders(),
    ...extraHeaders,
  };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json", ...pinHeaders };
    init.body = JSON.stringify(body);
  } else if (Object.keys(pinHeaders).length > 0) {
    init.headers = pinHeaders;
  }
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ResultUnknownError();
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
  if (controller.signal.aborted) throw new ResultUnknownError();
  if (!res.ok) throw await apiErrorFromResponse(res, requestAuthGeneration);
  if (res.status === 204) return undefined as T;
  try {
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  } catch {
    throw new ResultUnknownError();
  }
}

export const postJson = <T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> => writeJson<T>(url, "POST", body, signal);
export const putJson = <T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> => writeJson<T>(url, "PUT", body, signal);
export const patchJson = <T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> => writeJson<T>(url, "PATCH", body, signal);
export const deleteJson = <T = void>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<T> => writeJson<T>(url, "DELETE", body, signal, extraHeaders);
