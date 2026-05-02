/**
 * MES features barrel — `@/features/mes`.
 *
 * Round-3: 디렉터리 구조만 도입. 실제 컴포넌트 이동은 Round-4 부터.
 *
 * 권장 사용 (다음 라운드부터):
 *   import { ... } from "@/features/mes/admin";
 *   import { ... } from "@/features/mes/inventory";
 *   import { ... } from "@/features/mes/shared";
 *
 * 이동 우선순위 (Round-4):
 *   1. shared (cross-feature 헬퍼)
 *   2. admin (DesktopAdminView 분해 산출물)
 *   3. history
 *   4. warehouse
 *   5. inventory
 *   6. mobile
 *   7. app-shell
 *
 * 이동 정책:
 *   - 한 번에 1 feature 만
 *   - 외부 import 호환 wrapper 우선
 *   - 큰 컴포넌트는 sub-component 부터 분리
 */
export {};
