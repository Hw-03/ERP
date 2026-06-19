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

## 향후 개선 후보 (2026-06-19 실제 코드 검증 완료)

아래는 처음에 "큰 파일이니 쪼개야 한다"고 본 후보를, 발췌가 아니라 실제 코드로 다시 확인(deep-read + 반박)한 결과다. 검증해 보니 **대부분은 이미 상당 부분 정리돼 있었고**, 첫 인상이 과장한 부분이 많았다. 전부 지금은 보류 — 권동환 사원이 코드를 본 뒤 경계를 함께 정해 진행한다.

### 거의 끝난 것 (추가 작업 가치 낮음)

- `frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx` (886줄)
  - URL 동기화·draft 복원·preselect는 이미 `useIoUrlSync`·`useIoDraftRestore`·`useIoPreselect` 훅으로 분리·단위테스트 통과. 남은 혼재는 DOM 레이아웃 effect(약 130줄, "350줄"은 과장)뿐.
  - "테스트 불가·인터페이스 없음"은 사실이 아님 — 추출된 훅 7개 + 단위테스트 3종이 이미 통과 중.
  - 레이아웃 훅을 더 떼는 건 deepening이 아니라 줄 옮기기에 가깝고, 모바일과 dirty/flush 모델이 달라 dual-shell E2E 부담(ADR-0003)만 늘린다.

- `backend/app/routers/inventory/transactions.py` 취소·역산
  - 진짜 역산 로직(`apply_effect_reverse`)은 이미 `services/inv_effect.py`로 분리·단위테스트(`test_effect_helper_roundtrip`)됨.
  - 라우터에 남은 `_cancel_one_log`(799-932)은 `inventory_effect`가 없는 **레거시 로그용 폴백**뿐. 신규 거래는 모두 effect를 남기므로 점점 죽어가는 경로다.
  - 따라서 "서비스로 빼자"는 추출 가치가 낮다(얇은 pass-through만 추가). 음수 가드·`_sync_total` 순서가 얽힌 destructive 경로라 위험 대비 실익이 적다.

### 진짜 남은 것 (작고 비교적 안전, 그래도 리뷰 후 합의로)

- `backend/app/routers/production.py` 생산 입고 오케스트레이션 (헬퍼 `_load_and_merge_requirements`·`_preload_components`·`_assert_no_shortage`·`_backflush_components`·`_record_production`, 111-275)
  - 재고 primitive와 BOM 전개는 이미 서비스에 있고, 라우터엔 시퀀싱·로그·트랜잭션 경계 같은 coordination만 남음. `services/production_receipt.py`로 추출하면 HTTP 없는 단위테스트 seam이 생긴다.
  - **즉시 정리 가능한 부수확**: `merge_requirements`를 import만 하고 안 씀(dead import) + 같은 merge 루프가 두 곳에 인라인 중복(133-135, 293-295).
  - 위험: 중간. 동시성 테스트(`test_production_receipt_concurrent_same_item`)가 트랜잭션 경계·422/500 매핑을 핀하고 있어 추출 시 보존 필요(monkeypatch 대상도 갱신).

- 품목 정렬 comparator → `sortItemsForPicker` 순수함수 추출
  - 필터·우선순위 맵 3종은 이미 `itemPickerShared`가 공유함(중복 아님 — 첫 진단이 틀렸던 부분). 남은 건 4단계 정렬(rank→priority→assemblyRank→idx)이 `IoTargetPicker`·`DefectItemPicker`에 **4벌 verbatim 복제**된 것뿐.
  - 순수함수라 가장 안전한 deepening. **단 정렬 순서를 고정하는 테스트가 전무하니 골든 테스트 먼저.**
  - 순서편집 상태머신·`EditOrderTable` 통합은 별개로 더 크고 모바일(ADR-0003) 회귀 부담 있음 — 경계 합의 대상.

- 승인 큐 쿼리 빌더 (`backend/app/routers/stock_requests.py` 143-152/165-174, 202-215/238-250)
  - list/count가 동일 where절을 각자 중복. 공통 빌더로 묶으면 정책 변경이 한 곳에 모인다. 작업 자체는 작음.
  - **주의: 부서 큐 필터는 "누가 어느 부서 결재를 보는가"를 정하는 인가(authorization) 경계다.** `None`(전체)/빈 집합(권한 없음) 번역을 한 곳만 잘못 옮기면 결재 가시성이 조용히 넓어진다. 가시성 자체를 검증하는 테스트가 얇음 → Opus급 신중함 필요.

### ADR 메모
- 어느 후보도 기존 ADR(0001~0005)을 위반하지 않는다.
- ADR-0003(모바일=데스크톱 V2 재사용)이 프론트 후보의 검증 비용을 올린다(dual-shell·양 viewport E2E 강제).
- ADR-0005의 "재사용처가 생길 때 흡수한다(미사용 추상화 회피)" 철학이 전반적으로 선제 추출에 대한 신중론을 뒷받침한다.

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
