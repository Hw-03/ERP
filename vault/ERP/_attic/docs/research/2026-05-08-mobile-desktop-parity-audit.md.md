---
type: file-explanation
source_path: "_attic/docs/research/2026-05-08-mobile-desktop-parity-audit.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-08-mobile-desktop-parity-audit.md — 2026-05-08-mobile-desktop-parity-audit.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-08-mobile-desktop-parity-audit.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `모바일 ↔ 데스크탑 기능 Parity Audit (2026-05-08)`
- `0. 활성 Render Path (검증 완료)`
- `1. 데스크탑 기능 인벤토리`
- `1.1 재고/대시보드 (`DesktopInventoryView.tsx`)`
- `1.2 입출고 (`DesktopWarehouseView.tsx`)`
- `1.3 내역 (`DesktopHistoryView.tsx`)`
- `1.4 주간보고 (`DesktopWeeklyReportView.tsx`)`
- `1.5 관리자 (`DesktopAdminView.tsx`)`
- `1.6 BOM Workbench (`_admin_sections/_bom_workbench/`)`
- `1.7 상단/로그인`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 모바일 ↔ 데스크탑 기능 Parity Audit (2026-05-08)

> **목적**: DEXCOWIN MES 모바일을 "데스크탑 축소판"이 아니라 현장 작업자용 별도 UX로 전면 개편하기 위한 사전 조사. 이 문서는 코드 수정 전에 데스크탑/모바일 기능 차이를 명확히 한 뒤 단계별 계획(Phase 1~7)으로 연결한다.

**관련 plan 파일**: `C:\Users\user\.claude\plans\proud-soaring-moler.md`

---

## 0. 활성 Render Path (검증 완료)

| 책임 | 실제 파일 (절대 경로) | 핵심 라인 |
|---|---|---|
| Next.js entry | `c:/ERP/frontend/app/legacy/page.tsx` | `LegacyPage` L30, `LegacyBody` L48 |
| 모바일/데스크탑 분기 | 같은 파일 | L100 `lg:hidden`, L138 `DesktopLegacyShell` |
| 탭 상태 | `LegacyBody` 내부 useState + URL 쿼리 | L51-55 `initialTab`, L73-80 `changeTab` |
| 권한 강제 이동 | 같은 파일 | L83-88 |
| 모바일 Shell + 하단 nav | `c:/ERP/frontend/app/legacy/_components/mobile/MobileShell.tsx` | `TabId` L13, `ALL_TABS` L15-20, 권한 필터 L39-46 |
| 작업자 세션 | `c:/ERP/frontend/app/legacy/_components/login/useCurrentOperator.ts` | `Operator` L11, `clearCurrentOperator()` L63 |
| 권한 매트릭스 | `c:/ERP/frontend/app/legacy/_components/_warehouse_steps/_constants.ts` | `WORK_TYPES` L31-37, `canEnterIO` L89, `workTypesForOperator` L95-107 |
| 알림 시트(이미 있음) | `c:/ERP/frontend/app/legacy/_components/mobile/AlertsSheet.tsx` | 전체 |
| Mobile primitives | `c:/ERP/frontend/app/legacy/_components/mobile/primitives/index.ts` | export 18종 |

**핵심**: `MobileBottomNav.tsx`라는 별도 파일은 **존재하지 않음** — 하단 nav는 `MobileShell.tsx` 내부에서 직접 렌더(L95-142). `LegacyBody`도 별도 파일 아님(`page.tsx`:48 함수). 모바일/데스크탑 분기는 Tailwind `lg:hidden`만 사용.

---

## 1. 데스크탑 기능 인벤토리

### 1.1 재고/대시보드 (`DesktopInventoryView.tsx`)
- **표시**: KPI 카드(전체/저재고/품절/보안재고), 키워드+부서+모델+KPI 필터, 우측 슬라이드 패널(예약/위치 분포/최근 거래 10건), 생산가능 용량 패널
- **액션**: 검색, 필터, 클릭→입출고 자동 이동, 우측 패널 토글

### 1.2 입출고 (`DesktopWarehouseView.tsx`)
**5개 작업유형** (`_warehouse_steps/_constants.ts:31-37` 검증):
1. `raw-io` (in/out/return) — 공급업체 입출고
2. `warehouse-io` (wh-to-dept/dept-to-wh) — 창고↔부서 이동
3. `dept-adjustment` (production/disassembly/correction) — 부서 재고 조정
4. `package-out` — 패키지 출하
5. `defective-register` — 불량 격리 (CAUTION_WORK_TYPES `_constants.ts:39`)

**4-탭 구조**: 요청 작성(compose) / 장바구니(draft) / 내 요청 / 승인함(창고 정·부 전용)
- Draft 자동 저장+복원, 권한 체크(`workTypesForOperator`)
- 단계: 담당자 선택 → 작업유형 → 품목 → 수량 → 승인 요청

**권한 매트릭스** (`_constants.ts:95-107` 검증):
| operator | 작업유형 |
|---|---|
| 창고 primary/deputy | 5종 모두 |
| 조립/출하 부서 | warehouse-io, dept-adjustment, package-out, defective-register |
| 기타 생산부서 (튜브/고압/진공/튜닝) | warehouse-io, dept-adjustment, defective-register |

### 1.3 내역 (`DesktopHistoryView.tsx`)
- 통계(필터된 거래 합계), 유형/기간/검색 필터, 달력/리스트 뷰 토글
- 우측 상세 패널: **메타 수정**(참고/메모/부서/작업자, `productionApi.metaEditTransaction`), **수량 보정**(`productionApi.quantityCorrectTransaction` — RECEIVE/SHIP만, 보정 거래 자동 생성), 수정 이력, 동 품목 최근 5건
- 참고번호 복사
```
