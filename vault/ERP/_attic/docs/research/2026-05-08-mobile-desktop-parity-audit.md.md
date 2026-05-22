---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-08-mobile-desktop-parity-audit.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-08-mobile-desktop-parity-audit.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-08-mobile-desktop-parity-audit.md]]

## 원본 첫 줄 (또는 메타)

```
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
```
