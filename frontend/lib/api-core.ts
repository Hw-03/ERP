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
 *
 * shortages 가 있으면 줄바꿈으로 추가한다.
 */
export function extractErrorMessage(detail: unknown, fallback = "처리 실패"): string {
  if (typeof detail === "string") return detail;
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
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return extractErrorMessage(json?.detail, text || res.statusText);
  } catch {
    return text || res.statusText;
  }
}

/**
 * 일반 GET 페치 — JSON 응답 반환. AbortSignal 지원.
 */
export async function fetcher<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new Error(
      error instanceof Error
        ? `API 연결에 실패했습니다. ${url} 주소에 접근할 수 있는지 확인해 주세요.`
        : "API 연결에 실패했습니다.",
    );
  }
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return res.json();
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
): Promise<T> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(await parseError(res));
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const postJson = <T>(url: string, body?: unknown): Promise<T> =>
  writeJson<T>(url, "POST", body);
export const putJson = <T>(url: string, body?: unknown): Promise<T> =>
  writeJson<T>(url, "PUT", body);
export const patchJson = <T>(url: string, body?: unknown): Promise<T> =>
  writeJson<T>(url, "PATCH", body);
export const deleteJson = <T = void>(url: string, body?: unknown): Promise<T> =>
  writeJson<T>(url, "DELETE", body);
