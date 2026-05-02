"use client";

/**
 * legacyUi.ts — DEXCOWIN MES 호환용 thin barrel.
 *
 * Round-10A~F 정리 완료 — 모든 도메인 함수 본문은 `@/lib/mes/*` 정본으로 이전됨.
 * 본 파일은 LEGACY_COLORS re-export 만 유지 — 호출처 130여 파일의 점진 이전을 위해
 * 일시 보존. 향후 Round-10G 에서 호출처 import 경로 일괄 전환 후 본 파일 삭제 예정.
 */

export { LEGACY_COLORS } from "@/lib/mes/color";
