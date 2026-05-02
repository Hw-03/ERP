"use client";

/**
 * 호환 wrapper — 본문은 frontend/features/mes/shared/ConfirmModal.tsx 로 이전.
 * R7-FEATURE1 적용. 기존 호출처 ("./common" 또는 "../common/ConfirmModal") 모두 그대로.
 *
 * 새 코드는 @/features/mes/shared/ConfirmModal 또는 @/features/mes/shared 권장.
 */
export {
  ConfirmModal,
  type ConfirmTone,
} from "@/features/mes/shared/ConfirmModal";
