"use client";

/**
 * 호환 wrapper — 본문은 `frontend/features/mes/shared/Toast.tsx` 로 이전.
 * R5-9 적용. 기존 호출처 (`./_components/Toast` 또는 `../Toast`) 모두 그대로.
 *
 * 새 코드는 `@/features/mes/shared/Toast` 또는 `@/features/mes/shared` 에서 import 권장.
 */
export { Toast, type ToastState } from "@/features/mes/shared/Toast";
