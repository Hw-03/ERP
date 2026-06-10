# 클린코드 리뷰 준비 지도 - 2026-06-10

## 목적

권동환 사원이 DEXCOWIN MES 코드를 처음 본다는 전제로, 어디서부터 읽으면 되는지와 어떤 구조 개선 후보가 남아 있는지를 정리한다.

이번 정리는 대형 리팩터링이 아니라 첫 진입 비용을 낮추기 위한 작업이다. 현재 운영 중인 핵심 입출고 UI와 거래 라우터는 동작 안정성을 우선해 구조 변경하지 않았다.

## 먼저 볼 순서

1. `frontend/app/mes/page.tsx`
   - 앱 진입점이다.
   - 전역 Provider, 로그인 게이트, 모바일/데스크톱 Shell 분기를 확인한다.

2. `frontend/app/mes/_components/DesktopMesShell.tsx`
   - 데스크톱 화면의 중심 Shell이다.
   - 탭 전환, URL query 동기화, 상단 상태 메시지, 주요 화면 연결을 담당한다.

3. `frontend/app/mes/_components/_warehouse_v2/README.md`
   - 입출고 2.0 Module을 보기 전에 읽는 안내 문서다.
   - `IoComposeView.tsx`, `IoTargetPicker.tsx`, draft, preview, submit 흐름의 위치를 설명한다.

4. `backend/app/routers/inventory/transactions.py`
   - 거래 내역 조회, 요약, export, 메타 수정, 수량 보정 라우터다.
   - 현재는 기능이 한 파일에 모여 있으므로 수정 전 테스트를 먼저 확인한다.

5. `backend/app/routers/defects.py`
   - 불량 처리 진입 라우터다.
   - 프론트의 `_defect_hub/` 화면과 함께 보면 흐름을 이해하기 쉽다.

## 현재 이름 정리

- 예전 `frontend/app/legacy/` 폴더는 현재 `frontend/app/mes/`로 개명되어 있다.
- 데스크톱 Shell 이름도 `DesktopLegacyShell`에서 `DesktopMesShell`로 정리했다.
- `legacy_part`, `legacy_item_type`은 과거 원본 데이터의 필드명이라 유지한다.
- `LEGACY_COLORS`는 아직 넓게 쓰이는 호환 이름이라 이번 작업에서 바꾸지 않았다.

## 향후 개선 후보

아래 항목은 클린코드 후보지만, 이번 리뷰 준비 작업에서는 보류했다.

- `frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx`
  - 후보: autosave, layout 보정, 순수 업무 계산 로직 분리
  - 보류 이유: 입출고 핵심 UI이며 draft, BOM, 스크롤, 제출 흐름이 얽혀 있어 regression 위험이 크다.

- `frontend/app/mes/_components/_warehouse_v2/IoTargetPicker.tsx`
  - 후보: 필터, 정렬, 테이블 렌더링 분리
  - 보류 이유: 품목 선택 UX와 개인별 품목 순서 저장, BOM/단품 선택 규칙이 함께 있어 경계 합의가 필요하다.

- `backend/app/routers/inventory/transactions.py`
  - 후보: 거래 메타 수정/수량 보정 로직을 `backend/app/services/transaction_edit.py`로 추출
  - 보류 이유: 방향은 타당하지만, 리뷰 직전에는 거래 수정/보정 흐름을 흔들지 않는 편이 안전하다.

## 리뷰 전 검증 기준

권동환 사원에게 코드를 보여주기 전 최소 확인:

```powershell
rg -n "LegacyPage|LegacyBody|DesktopLegacyShell" frontend/app/mes
```

기대값: 0건

```powershell
rg -n "frontend/app/legacy" _attic/docs/ARCHITECTURE.md _attic/docs/adr frontend/app/mes
```

기대값: 현재 안내 문서에는 0건

```powershell
cd frontend
npm run lint:strict
npm run test
npm run build
```

```powershell
cd backend
pytest -q
```

## 리뷰 때 설명할 문장

이 코드는 AI와 바이브 코딩으로 빠르게 만든 운영 MES다. 최근 정리에서 현재 UI 경로를 `mes/`로 맞추고, 오래된 `legacy` 이름은 실제 과거 데이터 필드처럼 의미가 정확한 곳만 남겼다. 큰 파일은 숨기지 않았고, 위험한 핵심 흐름은 리뷰 후 함께 경계를 정해 나누는 편이 안전하다고 판단했다.
