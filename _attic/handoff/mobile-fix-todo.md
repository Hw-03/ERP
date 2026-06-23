# 모바일 화면 수정 투두리스트

> 사용자가 모바일 화면을 하나씩 보며 불러주는 수정 요청을 모으는 파일.
> "구현해"라고 할 때까지 구현하지 않고 수집·정리만 한다.
> 시작: 2026-06-17

> **1차(항목 1~18) 전부 완료·푸시·직원 서버 배포 완료 (2026-06-17).** 아래 1차 목록은 이력으로 보존.
> 2차 수집은 문서 맨 아래 `## 2차 수집` 섹션에 적는다.

## 상태 범례
- [ ] 대기 (아직 구현 안 함)
- [x] 완료

---

## 수집된 항목

### 1. 대시보드 — 생산 가능 현황 카드 정리 (A안 확정)
- [ ] 화면: 모바일 대시보드 상단 "생산 가능 현황" 접기 카드
- 문제: ① `⚡ 생산 가능 현황`(접기 버튼) ↔ `⚡ 생산 가능`(펼친 패널 헤더) 문구·아이콘 중복 ② 펼쳤더니 또 클릭 가능한 카드+자세히보기라 단계가 어색
- **A안 (확정)**:
  1. 펼친 인라인 패널(`InventoryCapacityPanel`)의 `⚡ 생산 가능` 헤더 줄(아이콘+상태+자세히보기 링크) **삭제** → 모델 합계 **표만** 남김
  2. 상태(생산가능/생산불가/BOM미등록 등)는 버리지 말고 **접기 버튼(1겹) 우측에 작은 컬러 배지**로 이동 (예: `⚡ 생산 가능 현황  [생산 가능]  ﹀`)
  3. `자세히 보기`는 펼친 표 **맨 아래 전폭 버튼**(`자세히 보기 →`)으로 분리
  4. 팝업(`CapacityDetailModal`)은 **유지** — 병목·개별 AF·출하경로(PF) 정보가 표에 없으므로 살려둠
- 관련 파일:
  - `frontend/app/mes/_components/mobile/screens/MobileDashboardScreen.tsx` (접기 버튼 = 1겹)
  - `frontend/app/mes/_components/_inventory_sections/InventoryCapacityPanel.tsx` (2겹 헤더 — 모바일 sm:hidden 블록만 손대기, 데스크톱 영향 주의)
  - `frontend/app/mes/_components/CapacityDetailModal.tsx` (3겹 팝업 — 유지)
- **컬럼 레이블 통일 (추가 확정)**:
  - 인라인 표 (`InventoryCapacityPanel`): `출하` / `조립` / `총생산` → `출하 대기` / `빠른 조립` / `총생산`
  - 팝업 (`CapacityDetailModal`): `출하준비` / `빠른조립` / `총생산` → `출하 대기` / `빠른 조립` / `총생산`
  - 두 곳 모두 **동일 표기**로 통일
- 주의: `InventoryCapacityPanel`은 데스크톱과 공유. 모바일(`sm:hidden`) 분기만 수정하고 데스크톱 인라인 칩 레이아웃은 건드리지 말 것.

---

### 2. 대시보드 — 필터 열릴 때 목록이 뒤로 숨는 문제
- [ ] 화면: 모바일 대시보드, 필터 열린 상태에서 스크롤 시 목록이 필터 뒤로 숨어버림
- 원인: 검색창 + 필터 칩 전체가 같은 `sticky` div 안에 묶여 있어 필터가 열리면 sticky 영역이 커지고 그 아래 목록이 가려짐
- 수정 방향: **데스크톱처럼 분리** — `sticky` div 안에는 검색창+필터 버튼만 남기고, `InventoryFilters`(부서/모델/공정 칩들)는 sticky div **밖 아래**로 이동 → 필터 열리면 칩들이 목록을 아래로 밀어내는 일반 흐름으로 작동
- 관련 파일: `frontend/app/mes/_components/mobile/screens/MobileDashboardScreen.tsx` (sticky div 분리)
- 데스크톱 영향 없음 (모바일 전용 코드)

### 3. 대시보드 — 품목 클릭 바텀시트 "빠른 작업" 버튼 색상 및 레이아웃
- [ ] 화면: 모바일 대시보드에서 품목 클릭 시 올라오는 바텀시트 하단 "빠른 작업" 영역
- 관련 파일: `frontend/app/mes/_components/_inventory_sections/InventoryDetailPanel.tsx` (205~284줄)
- **변경 사항**:
  1. **출고 버튼** 색상: 현재 회색(`LEGACY_COLORS.s3`) → 빨간색(`LEGACY_COLORS.red` 계열)으로 변경, 글자도 흰색
  2. **레이아웃 변경**: 서브 버튼들이 현재 `grid-cols-2` 컬럼 안(절반 너비)에 갇혀 있음 → 메인 버튼 두 개(입고/출고)는 나란히 유지, 서브 옵션은 그 아래 **전폭**으로 펼침
  3. **입고 서브 버튼** (부서 입고, 창고 반입): 파스텔 파란 계열 배경 + 파란 계열 텍스트
  4. **출고 서브 버튼**: 파스텔 빨간 계열 배경 + 빨간 계열 텍스트
- 최종 구조:
  ```
  [ 입고 (파랑) ]  [ 출고 (빨강) ]   ← grid-cols-2, 항상 나란히
  [ 서브 버튼 전폭 ]                  ← 둘 중 하나 눌렀을 때만 표시
  ```

### 4. 입출고 탭 — 섹션 탭 전폭 채우기
- [ ] 화면: 입출고 탭 상단 "요청 작성 / 작업 중 / 내 요청 / (권한별 추가)" 탭
- 관련 파일: `frontend/app/mes/_components/_warehouse_sections/WarehouseSectionTabs.tsx`
- 문제: 모바일에서 `flex + min-w-[86px] + overflow-x-auto` → 탭이 고정폭으로 옆 스크롤
- 수정: 모바일도 데스크톱처럼 `grid` 균등분할 적용 → 탭 수에 상관없이 항상 전폭 꽉 채움
- 주의: 데스크톱(`lg:`) 레이아웃 건드리지 말 것

### 5. 입출고 탭 — "이렇게 진행됩니다" 제거
- [ ] 화면: 입출고 Step 1 (작업 유형 선택) 하단
- 관련 파일: `frontend/app/mes/_components/mobile/warehouse/MobileWorkTypeStep.tsx` (82~117줄)
- 수정: 해당 블록 전체 삭제

### 6. 입출고 탭 — Step 헤더 어색함 개선
- [ ] 화면: 탭 바로 아래 "Step 1 / 5 | 작업 유형" 행 + 진행 바
- 관련 파일: `frontend/app/mes/_components/mobile/primitives/WizardHeader.tsx`
- 문제: 탭(요청 작성/작업 중/내 요청)과 Step 헤더가 시각적으로 따로 노는 느낌. 배경·카드 스타일 때문에 더 동떨어져 보임
- 수정 방향: **진행 바(━━━━)는 유지**, "Step N/5" 텍스트와 현재 단계명은 심플하게 정리해서 탭과 자연스럽게 이어지도록 스타일 개선 (카드 배경 제거, 탭과 같은 흐름으로)
- 구체적 방안은 구현 시 판단

### 7. 입출고 탭 — Step 1·2 버튼 전폭 타일
- [ ] 화면: 입출고 Step 1 (작업 유형 선택), Step 2 (세부 작업과 부서)
- 관련 파일: `frontend/app/mes/_components/mobile/warehouse/MobileWorkTypeStep.tsx`
- **Step 1** (작업 유형 선택 — 창고 입출고 / 부서 입출고 등):
  - 문제: 세로 스택 카드, 고정 높이(`min-h-[96px]`) → 화면 아래가 비어 보임
  - 수정: 버튼들이 남은 화면 높이를 가로+세로 전폭으로 균등 분할. 버튼 수(담당자 권한에 따라 1~N개)에 상관없이 항상 화면 꽉 채움
- **Step 2** (세부 작업 + 부서 선택):
  - 문제: 세부 작업 버튼(2열), 도착 부서 버튼(3열)이 고정 높이라 아래가 많이 비어 보임
  - 수정: Step 2 전체 컨텐츠도 화면 남은 높이를 꽉 채우도록 — 세부 작업 버튼 + 부서 그리드가 가용 공간을 균등 분할
- 구현 힌트: 버튼 컨테이너 `flex-1 flex flex-col`, 각 버튼 `flex-1`로 높이 균등 분할

### 8. 입출고 Step 3 — "스캔으로 시작" 버튼 숨기기
- [ ] 화면: 입출고 Step 3 (품목 선택 화면) 상단 큰 파란 버튼 "스캔으로 시작"
- 관련 파일:
  - `frontend/app/mes/_components/mobile/warehouse/MobileIoComposeWizard.tsx` (503~507줄, `PrimaryActionButton label="스캔으로 시작"`)
  - `frontend/app/mes/_components/mobile/warehouse/MobileSingleAdjustForm.tsx` (79줄, `IconButton icon={ScanLine}`)
- 수정: **UI에서만 숨김** (버튼 렌더 제거 또는 `hidden`). 코드(`scanOpen`, `handleScanDetected`, `BarcodeScannerModal`) 는 절대 삭제하지 말 것 — 나중에 다시 쓸 수 있음

### 9. 입출고 Step 3 — 부서/모델/단계 필터 드롭다운 폭 채우기
- [ ] 화면: 입출고 Step 3 (품목 선택 화면) 상단 `부서 | 모델 | 단계` 드롭다운 필터
- 관련 파일: `frontend/app/mes/_components/_warehouse_v2/IoTargetPicker.tsx` (필터 영역)
- 수정: 드롭다운 3개가 가로 폭을 균등하게 꽉 채우도록 (`flex-1` 또는 `grid grid-cols-3`)

### 10. 입출고 Step 3 — "수량 조정 →" 버튼 하단 고정
- [ ] 화면: 입출고 Step 3 (품목 선택) 품목 리스트 맨 아래 "수량 조정 →" 버튼
- 관련 파일: `frontend/app/mes/_components/_warehouse_v2/IoTargetPicker.tsx` (411~436줄)
- 문제: 품목이 많으면 버튼이 스크롤 맨 아래에 숨어서 안 보임 → 사용자가 다음 단계로 못 가는 UX 문제
- 수정: `StickyFooter` 또는 `position: sticky bottom-0`으로 하단 네비바 바로 위에 항상 고정
- 주의: IoTargetPicker는 모바일/데스크톱 공용일 수 있으니 모바일 전용(`sm:hidden` 분기)으로 처리

### 11. 모바일 헤더 — 상태 메시지 칩으로 표시
- [ ] 화면: 모바일 전체 헤더 (`MobileShell.tsx`)
- 문제: `onStatusChange` 메시지(예: "품목명 작업 묶음 생성")가 하단 플로팅 배너 토스트로 떠서 어색함. 데스크톱은 헤더의 `DEXCOWIN MES System` 칩에 표시됨
- 수정:
  1. 모바일 헤더의 `DEXCOWIN MES` 텍스트를 데스크톱처럼 **상태 표시 칩** 형태로 변경
  2. `handleStatusChange`의 일반 info 메시지는 이 칩의 텍스트를 일시적으로 업데이트 (일정 시간 후 `DEXCOWIN MES`로 복귀)
  3. 하단 플로팅 배너 토스트는 **에러 메시지만** 유지, 일반 info는 제거
- 관련 파일: `frontend/app/mes/_components/mobile/MobileShell.tsx` (헤더 영역 + `handleStatusChange`)

### 12. 입출고 Step 4 — 안내 문구 제거
- [ ] 화면: 입출고 Step 4 (품목 확인 / 실제 반영 화면)
- 관련 파일: `frontend/app/mes/_components/_warehouse_v2/IoBundleCart.tsx` (48~50줄)
- 수정: "체크된 품목만 재고에 반영됩니다. 체크를 해제하면 이번 작업에서 제외됩니다." `<p>` 블록 삭제

### 13. 입출고 Step 4 — 제출확인 버튼 하단 고정
- [ ] 화면: 입출고 Step 4 (품목 확인 화면) 하단 "제출확인 →" 버튼
- 관련 파일: `frontend/app/mes/_components/_warehouse_v2/IoBundleCart.tsx` (104~122줄)
- 문제: `mt-auto`로 밀어두었으나 품목이 많으면 스크롤해야 보임
- 수정: `StickyFooter`로 감싸서 하단 네비바 위에 항상 고정

### 14. 입출고 Step 4 — 가능재고 / 실행 후 / 휴지통 배치 개선
- [ ] 화면: 입출고 Step 4 개별 품목 카드 내 수량 스텝퍼 영역
- 관련 파일: `frontend/app/mes/_components/_warehouse_v2/IoBundleCard.tsx` (243~277줄)
- 문제: `가능재고` · `실행 후` 숫자와 🗑️ 휴지통이 한 줄에 섞여 배치가 어색
- 수정 방향: 가능재고 / 실행 후는 수량 스텝퍼 아래에 좌우로 깔끔하게 배치, 휴지통은 카드 우상단으로 분리 (또는 별도 영역으로 명확히 구분)
- 주의: 데스크톱과 공유 컴포넌트 — 모바일(`sm:hidden` / 분기) 스코프로만 수정

### 15. 입출고 Step 4 — 수량 조절 버튼 모바일 터치 타깃 확대
- [ ] 화면: 입출고 Step 4 개별 품목 카드 내 `-10 / -1 / [숫자] / +1 / +10` 버튼
- 관련 파일: `frontend/app/mes/_components/_warehouse_v2/IoBundleCard.tsx` (155~218줄)
- 문제: 현재 `px-1.5 py-0.5 text-[11px]` — 44px 터치 타깃 미달, 모바일에서 누르기 불편
- 수정: 모바일 전용으로 버튼 패딩·폰트 확대, 최소 터치 타깃 44px 이상 확보
- 주의: 데스크톱과 공유 컴포넌트이므로 모바일 분기 처리

### 16. 입출고 — 모바일 중간 이탈 시 저장 팝업 없음
- [ ] 화면: 입출고 위저드 진행 중 하단 탭바(대시보드/불량/내역/더보기)로 이탈할 때
- 문제: `MobileDirtyLeaveSheet`·더티 가드(`composeDirty`)가 **섹션 탭 전환**(compose→cart 등)에만 작동. 하단 네비바로 아예 다른 탭으로 이동할 때는 팝업이 뜨지 않음 → PC와 달리 데이터 손실 위험
- 수정: 하단 네비바 탭 전환 시에도 `composeDirty === true`이면 `MobileDirtyLeaveSheet`(또는 동일 확인 다이얼로그)를 띄워 PC와 동일하게 동작
- 관련 파일:
  - `frontend/app/mes/_components/mobile/MobileShell.tsx` (탭 전환 핸들러)
  - `frontend/app/mes/_components/mobile/warehouse/MobileDirtyLeaveSheet.tsx` (팝업 컴포넌트 — 재사용)

### 17. 입출고 — Step 진행 바 가독성 개선
- [ ] 화면: 입출고 위저드 전 단계 상단 `WizardHeader` 진행 바
- 관련 파일: `frontend/app/mes/_components/mobile/primitives/WizardHeader.tsx`
- 문제: 진행 바 세그먼트가 얇고, 완료된 단계와 현재·미래 단계 구분이 직관적이지 않음 (이미 #6 항목과 연관)
- 수정 방향: 완료 세그먼트를 더 진하게, 현재 세그먼트는 강조, 미래는 흐리게 — 또는 세그먼트 사이에 숫자 dot 추가 등으로 "지금 어디에 있는지" 명확히 표현 (구체적 방안은 구현 시 판단)

### 18. 부서 입출고 — 창고 입출고와 동일하게 적용
- [ ] 부서 입출고 흐름도 창고 입출고와 동일한 수정 사항 적용
- 해당 항목: #4(탭 전폭), #5(이렇게 진행됩니다 제거), #6(Step 헤더), #7(버튼 전폭 타일), #8(스캔 숨기기), #12(안내문구 제거), #13(제출확인 하단고정), #14(가능재고/실행후/휴지통 배치), #15(수량버튼 터치타깃), #16(이탈 팝업), #17(진행 바)
- 별도 파일 수정 없이 대부분 동일 컴포넌트(`IoBundleCart`, `IoBundleCard`, `WizardHeader` 등) 공유 → 창고 입출고 수정 시 자동 반영되는 항목이 많음. 구현 시 부서 입출고 전용 분기가 있는지 확인 필요

## 메모 / 미해결 질문

- **저장하기 버튼 위치** (Step 5에만 있음): 중간 단계에서도 노출할지 여부 — PC와 일관성 검토 후 결정 예정. 구현 전 사용자 재확인 필요.
  - → 1차에서 **Step 5 유지로 확정**(PC 동일). 항목 16 이탈 가드가 중간 안전망.

---

## 2차 수집 (시작: 2026-06-17)

> 여기에 새 항목을 번호로 적는다. 형식은 1차와 동일(화면·문제·수정 방향·관련 파일·PC 무변경 주의).

> **진행 상태 (2026-06-19):** 2차 10항목 코드 **전부 완료·커밋·푸시**(origin/main). 2-1~2-9 = 7커밋(~6327540a), 2-10 = `3ccb00f4 mobile: 창고지도 가로 전용 전면 재설계`. **2-10만 실기(폰) 확인 대기** — 강제 가로 회전이라 헤드리스로 화면 검증 불가, 직원 서버 배포 후 폰에서 가로 모양·터치·safe-area 확인 뒤 `[x]` 마감 예정.
> 검증된 스코프 정정: ① 2-6 달력은 `HistoryCalendarStrip`/`HistoryCalendarPanel`이 데스크톱(DesktopHistoryView)과 **공유** → `hideWeekends` prop을 모바일 호출처(MobileHistoryScreen)에서만 내려 5열로(PC 7열 유지). ② 2-5 `DefectHubPanel`은 **모바일 전용**(데스크톱은 DesktopDefectView+DefectHubEntry) → 자유 편집.

### 2-1. 대시보드 BOM 하위 구성 — 긴 이름 풀네임 보기(모바일 탭 펼침)
- [x] 화면: 대시보드 품목 클릭 → 바텀시트 "하위 구성"(읽기 전용) BOM 행. 이름이 길면 1줄 truncate 되어 잘림.
- 문제: 데스크톱은 hover 툴팁으로 풀네임 확인 가능하지만 모바일엔 hover 없음.
- **확정 방식 (탭 = 전체 폭 펼침)**:
  - 기본은 현행처럼 **이름 1줄 truncate**(스캔 가능, 목록 깔끔).
  - 행을 **탭하면 그 행만** 펼쳐지며 **이름이 행 가로 폭을 전부 차지**해 2~3줄로 전체 표시되고, 코드·조립(부서 배지)·×수량 **메타는 이름 아래 줄로 reflow**. 다시 탭하면 1줄로 접힘.
  - 이유: 단순 줄바꿈만 하면 이름이 우측 코드/×수량과 폭을 나눠 작은 화면에서 비좁음 → 펼칠 때 이름이 폭을 독점해야 또렷이 읽힘.
  - (대안으로 검토했던 하단 팝업 시트·항상 줄바꿈은 보류 — 탭 펼침으로 확정.)
- 관련 파일(구현 시 실제 렌더 경로 확인):
  - `frontend/app/mes/_components/_warehouse_v2/BomSubExpander.tsx` (하위 구성 렌더 — 추정, 확인 필요)
  - 호출처: `frontend/app/mes/_components/_inventory_sections/InventoryDetailPanel.tsx` (`<BomSubExpander ... compact />`)
- **PC 무변경 주의**: BomSubExpander 는 데스크톱 상세 패널과 **공유 가능성** → 탭 펼침 인터랙션은 **모바일 전용으로 스코프**(variant prop 또는 모바일 호출처 한정). 데스크톱 hover/현행 동작은 그대로 둘 것.

### 2-2. 입출고 섹션 탭 — 버튼 크기·글씨 확대 (스크롤 없이 전폭)
- [x] 화면: 입출고 상단 섹션 탭 (요청 작성 / 작업 중 / 내 요청 / 창고 승인함 / 부서 승인함 / 인수인계)
- 문제: 전폭 grid 적용(2-1차 항목 4)은 잘 됐으나 탭 버튼이 낮고(`min-h-[44px]`) 글씨가 작아(`text-xs`) 터치하기 불편
- **수정 사항(완료)**:
  - 글씨: `text-xs` → `text-sm` (모바일)
  - 버튼 최소 높이: `min-h-[44px]` → `min-h-[60px]` (모바일), `lg:min-h-[44px]`로 데스크톱 원복
  - 패딩: `py-2` → `py-3` (모바일)
  - 스크롤: 기존 grid 적용으로 이미 없음 — 유지
- 관련 파일: `frontend/app/mes/_components/_warehouse_sections/WarehouseSectionTabs.tsx`
- 적용 범위: 입출고의 모든 단계 진입 전 탭 (PC 무변경 확인)
- 커밋: `2026-06-19 mobile: 섹션 탭 버튼 크기·글씨 확대(text-sm, min-h-60px)`

### 2-3. 입출고 위저드 전 단계 — 스크롤 제거 + 화면 꽉 채움

> **MCP 브라우저로 DOM 직접 측정해 근본 원인 확인 (2026-06-19)**

#### 측정 결과 (Step 1 기준)

| 요소 | 값 |
|---|---|
| 스크롤 컨테이너 clientHeight | 577px |
| 스크롤 컨테이너 scrollHeight | **613px** |
| 오버플로우 | **+36px → 스크롤 발생** |

스크롤 컨테이너(`min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-3`) 안에 두 자식이 있음:
1. `<h2>작업 유형 선택</h2>` — 24px + mb-3(12px) = **36px**
2. 버튼 컨테이너 `flex min-h-full flex-col gap-2.5` — `min-h-full` = 컨텐트박스(553px)

합계 36 + 553 = **589px** > 컨텐트박스 553px → **36px 오버플로우 = 스크롤**

#### 시각적 문제 (버튼 빈 공간)
버튼 자체는 271.5px씩 컨테이너를 꽉 채우고 있으나, 아이콘·텍스트가 버튼 중앙에만 집중돼 위아래 여백이 크게 남아 보임.

---

#### 수정 계획 — 모든 위저드 단계 공통

**핵심 원칙**
- Step 1·2 (유형 선택, 세부 작업): **스크롤 없음** + 버튼이 가용 높이를 꽉 채움
- Step 3·4·5 (품목 선택, 수량 입력, 제출): 스크롤은 허용하되 단계 제목이 **추가 스크롤을 만들지 않음**

**Fix 1 — 단계 제목(H2) 스크롤 컨테이너 밖으로 이동**

파일: `MobileIoComposeWizard.tsx`

현재 구조:
```
<div class="overflow-y-auto px-3 pt-3 pb-3">       ← 스크롤 컨테이너
  <h2>작업 유형 선택</h2>                            ← 제목이 안에 있음
  <MobileWorkTypeStep />                             ← min-h-full = 553px
</div>
```

수정 후:
```
<h2 class="px-3 pt-3 pb-2">작업 유형 선택</h2>     ← 스크롤 컨테이너 밖으로
<div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3">  ← pt-3 제거(제목이 위로 나감)
  <MobileWorkTypeStep />                             ← min-h-full = 컨테이너 전체
</div>
```

효과: 제목 36px가 컨테이너 밖으로 빠지면, 버튼 컨테이너 `min-h-full`이 스크롤 컨테이너 전체를 채움 → 오버플로우 0 → 스크롤 없음

Step 1~5 모두 동일한 패턴이므로 한 번에 해결.

**Fix 2 — Step 1 버튼 내부 콘텐츠 확대 (빈 공간 개선)**

파일: `MobileWorkTypeStep.tsx`

현재 버튼 내 아이콘·텍스트:
- 아이콘 컨테이너: `h-12 w-12` (48px)
- 레이블: `text-lg font-black`
- 설명: `text-sm font-semibold`

수정:
- 아이콘 컨테이너: `h-16 w-16` (64px), 아이콘 자체 `h-8 w-8`
- 레이블: `text-xl font-black`
- 설명: `text-base font-semibold`
- 버튼 내부 gap: `gap-4` → `gap-5`

**Fix 3 — Step 2 동일 확인**
MobileSubTypeStep도 Step 1과 동일 구조(H2 + 컨테이너)이면 Fix 1로 자동 해결.
부서 그리드 버튼(`min-h-[48px]`), 방향 버튼(`min-h-[64px]`), 입력방식 버튼(`min-h-[60px]`)은 `flex-1`로 이미 높이 분할 — 제목만 밖으로 빼면 OK.

**Fix 4 — Step 3·4·5 검증**
스크롤이 필요한 단계이므로 `overflow-y-auto` 유지. 단, 제목을 밖으로 뺐을 때 레이아웃이 무너지지 않는지 확인.

---

#### 관련 파일
- `frontend/app/mes/_components/mobile/warehouse/MobileIoComposeWizard.tsx` — H2 제목 위치 이동 (핵심)
- `frontend/app/mes/_components/mobile/warehouse/MobileWorkTypeStep.tsx` — Step 1 버튼 콘텐츠 확대
- PC 영향 없음 (모바일 전용 컴포넌트)

---

### 2-4. 대시보드 — 현재고 / 안전재고 정렬 버튼 제거 (PC + 모바일 공통)

- [x] 화면: 대시보드 품목 목록 테이블 — 현재고 / 안전재고 열 헤더
- 문제: 정렬 버튼(▲▼)이 숫자를 오른쪽으로 너무 밀어붙여 정렬이 어색해 보임
- **확정**: 정렬 버튼 완전 제거. 기능 자체 삭제. 기본 순서는 **등록 순** (관리자 탭에서 설정한 품목 순서)
- PC + 모바일 둘 다 적용
- 관련 파일: `frontend/app/mes/_components/_inventory_sections/InventoryItemsTable.tsx`
  - 라인 12–22: `sortItems()` 함수 삭제
  - 라인 55–65: `sortCol`·`sortDir` 상태 + `handleSort()` 삭제
  - 라인 130–170: 현재고 / 안전재고 열 헤더 정렬 버튼 UI 삭제 → 일반 텍스트 헤더로 교체

---

### 2-5. 모바일 불량 처리 허브 — 첫 화면 재설계 (키오스크 방식)

- [x] 화면: 모바일 불량 탭 첫 화면
- 문제: 현재 버튼 2개(불량 격리 / 바로 폐기) + KPI 카드 + 필터 + 격리 목록이 한 화면에 전부 노출됨 → PC와 달리 혼잡
- PC 첫 화면: 불량 격리 / 바로 폐기 / 격리 목록 큰 카드 3개만 — 깔끔하게 선택만
- **확정**: 모바일 첫 화면을 **PC 카드 3개 스타일 + Step 1 버튼 스타일 믹스**로 재설계
  - 화면을 꽉 채우는 세로 3개 카드 (입출고 Step 1 버튼처럼 아이콘 + 이름 + 설명)
  - 카드 1: 불량 격리 (정상 재고에서 품목을 골라 격리 등록)
  - 카드 2: 바로 폐기 (격리 없이 즉시 폐기)
  - 카드 3: 격리 목록 (격리 항목 조회·복귀·폐기·반품)
  - 카드 누르면 다음 화면으로 전환 (KPI/필터/목록은 격리 목록 카드 눌렀을 때만 표시)
- PC 화면 변경 없음 (모바일 전용)
- 관련 파일:
  - `frontend/app/mes/_components/_defect_hub/DefectHubPanel.tsx` (라인 60–257, view 상태 분기)
  - `frontend/app/mes/_components/mobile/screens/MobileDefectCartFlow.tsx`
  - `frontend/app/mes/_components/mobile/screens/MobileDefectProcessPanel.tsx`
- 구현 방향: `view === "hub"` 일 때 모바일에서 KPI/필터/목록 숨기고 큰 카드 3개만 표시. prop 분기 또는 모바일 전용 허브 첫 화면 컴포넌트 추가.

---

### 2-6. 모바일 내역 달력 — 주말(토/일) 제거

- [x] 화면: 모바일 내역 탭 달력 (`HistoryCalendarStrip`)
- 문제: 7열(일~토) 구조라 모바일에서 좁고 난잡해 보임
- **확정**: 토/일 열 완전 제거 → 월~금 **5열**로 축소. 주말 기록은 전체 기간 조회로 확인 가능 (달력에서는 선택 불가)
- 관련 파일: `frontend/app/mes/_components/_history_sections/HistoryCalendarStrip.tsx`
  - 라인 157–170: 요일 헤더 배열 `["일","월","화","수","목","금","토"]` → `["월","화","수","목","금"]` 으로 변경
  - 라인 172–238: 날짜 그리드 — 주말 날짜 필터링 (getDay() === 0 || 6 제외)
  - 그리드 `grid-cols-7` → `grid-cols-5`
- PC 영향 없음 (모바일 전용 화면에서 사용)

---

### 2-7. 더보기 — 계정 관리 버튼 제거

- [x] 화면: 더보기 탭 화면
- 문제: "내 계정"(PIN 변경 · 로그아웃) 버튼이 있는데, 글로벌 헤더 프로필 버튼에도 동일 기능이 있어 중복
- **확정**: "계정" 섹션 + "내 계정" 메뉴 행 제거
- 관련 파일: `frontend/app/mes/_components/mobile/screens/MobileMoreScreen.tsx` (라인 42–48 "계정" 섹션 삭제)

---

### 2-8. 더보기 — 주간보고 / 창고 지도 큰 카드로 개편

- [x] 화면: 더보기 탭 화면
- 현재: "업무" 섹션 라벨 + 작은 메뉴 행(MoreMenuRow) 2개 (주간보고 / 창고 지도)
- **확정**:
  - "업무" 섹션 라벨 제거
  - 주간보고 / 창고 지도를 **큰 카드형 버튼**으로 교체
  - **확장성 고려**: 메뉴가 늘어날 수 있으니 그리드 레이아웃 기반으로 자유 디자인
  - 각 카드에 아이콘 + 이름 + 짧은 설명 포함
- 관련 파일: `frontend/app/mes/_components/mobile/screens/MobileMoreScreen.tsx`

---

### 2-9. 더보기 하단 네비바 — 진입 시 아이콘 + 라벨 동적 교체

- [x] 화면: 하단 네비바 5번째 탭 (더보기)
- 문제: 주간보고 / 창고 지도 진입 후 하단 네비바에 아무것도 강조 안 됨 (activeTab이 "weekly"/"warehouseMap"인데 TAB_BAR_IDS에 없음)
- **확정**: 진입 시 더보기 탭의 **아이콘 + 라벨 둘 다** 동적으로 교체
  - 더보기: `···` + "더보기" (기본)
  - 주간보고 진입: `📊(BarChart2)` + "주간보고"
  - 창고 지도 진입: `📍(MapPinned)` + "창고 지도"
  - 뒤로 / 다른 탭 이동 시: `···` + "더보기" 복귀
- 관련 파일: `frontend/app/mes/_components/mobile/MobileShell.tsx`
  - `activeTab` 기반으로 NavButton의 icon/label 동적 결정
  - "weekly" / "warehouseMap" → 더보기 탭 NavButton을 해당 아이콘/이름으로 오버라이드

---

### 2-10. 창고 지도 모바일 — 가로 전용 전면 재설계

- [ ] 화면: 모바일 창고 지도 (`MobileWarehouseMapScreen`) — **코드 완료·푸시(3ccb00f4), 실기(폰) 확인 대기**
- 현재 문제: 세로형 목록 → 그리드 → 바텀시트 구조라 PC의 평면도 느낌을 못 살림
- **확정**:
  1. **강제 가로 전환**: CSS `transform: rotate(90deg)` + `width/height` 스왑으로 창고 지도 화면 진입 시 자동 가로 모드. 사용자가 폰을 세로로 들고 있어도 가로로 보임
  2. **PC 컴포넌트 재사용**: 폰 가로 시 가로폭 ~800px → PC `WarehouseStages.tsx`(FloorStage / FrontStage / RowStage) 거의 그대로 재사용 가능
  3. **3단계 드릴다운 유지**: 평면도(앵글 전체) → 정면도(앵글 그리드) → 줄 확대(자리 상세)
  4. 기존 `MobileAngleList` / `MobileAngleGrid` / `MobileJariSheet` 는 대체 또는 폐기
- 관련 파일:
  - `frontend/app/mes/_components/mobile/screens/MobileWarehouseMapScreen.tsx` (전면 재설계)
  - `frontend/app/mes/_components/_warehouse_map_sections/WarehouseStages.tsx` (재사용 대상, FloorStage/FrontStage/RowStage)
  - `frontend/app/mes/_components/DesktopWarehouseMapView.tsx` (참고 — 검색·브레드크럼 로직)
- 구현 주의:
  - `rotate(90deg)` 적용 시 뷰포트 height → 실제 화면 width 가 됨. Tailwind `h-screen`/`w-screen` 처리 주의
  - 슬라이드 패널(`WarehouseJariPanel`)은 가로 화면 기준 우측 패널로 배치
  - 창고 지도 나가면 회전 해제

---

## 3차 수집 (시작: 2026-06-19)

> 형식은 1·2차와 동일(화면·문제·수정 방향·관련 파일·PC 무변경 주의). "구현해"라고 할 때까지 수집·정리만.

### 3-1. 모바일 헤더 상태 표시를 데스크톱 상단바와 통일
- [x] 화면: 모바일 전체 헤더 좌측(`MobileShell.tsx`) ↔ 데스크톱 상단바 상태 칩(`DesktopTopbar.tsx`) — 완료·푸시(2026-06-22)
- **현재 상태(코드 확인됨)**:
  - 데스크톱(`DesktopTopbar.tsx` 94–103, `DesktopMesShell.tsx` 63–78): 상태 칩 1개에 **전부** 표시. 평상시 `DEXCOWIN MES System`(brand `StatusPill`, font-black), 갱신/알림 메시지(info·에러 무관)도 같은 칩에 떴다가 3초 후 복귀.
  - 모바일(`MobileShell.tsx` 340–360): 평상시 **밋밋한 회색 평문 `DEXCOWIN MES`**(System 없음). 갱신 알림 중 **info/success는 이미 헤더 파란 칩에 표시**(1차 항목 11), **에러만 하단 플로팅 토스트로 분리**(item 11에서 느린 네트워크·접근성 위해 의도한 분리).
- **확정 (사용자 결정 2026-06-19) — 데스크톱과 100% 동일하게**:
  1. 모바일 기본 표시 — 텍스트 `DEXCOWIN MES` → **`DEXCOWIN MES System`**, 회색 평문 → **brand `StatusPill` 칩 룩**. (공유 컴포넌트 `StatusPill`/`inferToneFromStatus`(`./common`) 재사용 검토.)
  2. 갱신/상태 메시지를 **전부 그 헤더 칩 하나에** 표시(데스크톱 `DesktopTopbar`/`DesktopMesShell`과 동일). info/success 현행 유지.
  3. **에러도 헤더 칩으로 통일** — 현재의 하단 플로팅 토스트 분리는 **제거**하고 데스크톱처럼 헤더 칩에 표시(자동 복귀/ sticky 동작도 `DesktopMesShell` 로직에 맞춤). ⚠️ 이는 1차 item 11의 "에러만 토스트(수동 닫기 — 느린 네트워크·청각 보조용)" 의도를 **사용자 명시 결정으로 되돌리는 것**. 토스트 큐(`toastQueue`/`dismissToast`/하단 배너) 제거 시 그 점 인지.
- 관련 파일:
  - `frontend/app/mes/_components/mobile/MobileShell.tsx` (헤더 좌측 표시 + `handleStatusChange` 분기 + `headerStatus` 기본값)
  - 재사용 후보: `frontend/app/mes/_components/common/`의 `StatusPill`·`inferToneFromStatus`
- **PC 무변경**: 데스크톱 `DesktopTopbar`/`DesktopMesShell`은 손대지 않음. 모바일만 수정(헤더는 모바일 전용 코드).

### 3-2. 대시보드 BOM 하위구성 — 탭 가능 행의 어색한 테두리 정리
- [x] 화면: 대시보드 품목 클릭 카드 → "하위 구성" 행(2-1에서 이름 탭 펼침 추가). 클릭 가능하게 `<button>`으로 바꾸면서 행에 **얇은 테두리/그림자**가 생겨 어색함. — 완료·푸시(2026-06-22, no-btn-inset)
- 원인(코드 확인): 전역 `globals.css`의 `button { box-shadow: inset 0 0 0 1px rgba(0,0,0,.08) }`(166–171줄)가 새 name `<button>`(`BomSubExpander.tsx` 162·178줄)에 자동 적용. 내가 준 클래스엔 border 없음.
- **방향(추천: 테두리 제거)**: 그 button들에 전역 opt-out 클래스 `no-btn-inset`(globals.css 188–195) 추가해 inset 제거. 탭 가능 표시는 기존 행 hover/tap 하이라이트로 충분 → 별도 테두리 불필요. (대안: `<div role="button">`로 전역 button 규칙 회피.) 구현 시 최종 확정.
- PC 무변경: `tapToExpandName`(모바일 전용)일 때만 그 button 렌더 → 데스크톱 영향 없음.

### 3-3. 입출고 Step2 / 불량 단계 — 전폭·높이 채움 재점검
- [x] 화면: 입출고 Step2(세부작업/부서/방향), 불량 처리 각 단계. — 완료·푸시(2026-06-22): 입출고 Step2는 이미 전폭이라 무변경, 불량 카트 1단계만 전폭·하단고정 처리
- **코드 확인 결과(정정)**: 대부분 이미 전폭·전체높이임 —
  - 입출고 Step1·Step2(`MobileWorkTypeStep`/`MobileSubTypeStep`)는 `min-h-full` + 섹션 `flex-1` 적용됨. 단 Step2 섹션 버튼이 `justify-center`(가운데 정렬)라 **섹션 사이 여백이 커 비어 보일 수** 있음 → 버튼/그리드가 공간을 더 채우거나 여백 축소 검토.
  - 불량 `MobileDefectProcessPanel`(액션선택·BOM분해), `MobileDefectCartFlow` Step2(품목 담기)는 `h-full` + `StickyFooter`로 이미 전폭·하단고정.
  - **실제 미흡 1곳**: `MobileDefectCartFlow` Step1(출처·부서 선택, 207–280줄)은 `flex flex-col gap-4`만이라 **전체높이 미채움·버튼 하단 고정 안 됨** → 다른 단계처럼 `h-full min-h-0 flex-col` + `StickyFooter` 적용.
- 관련 파일: `mobile/warehouse/MobileWorkTypeStep.tsx`, `mobile/screens/MobileDefectCartFlow.tsx`(특히 step1).
- PC 무변경: 전부 모바일 전용 컴포넌트.

### 3-4. 입출고 — Step4 저장 버튼 + "저장 안 하고 나가기"
- [x] 화면: 입출고 위저드 Step4(품목 확인) + 작업 중 탭 이탈 시트. — 완료·푸시(2026-06-22): Step4 저장 버튼(모바일 스코프) + "저장 안 하고 나가기" 추가
- **확정 1 — Step4에도 저장 버튼**: 현재 임시저장 버튼은 Step5(`IoConfirmStep.tsx` 260–273)에만. Step4(`IoBundleCart`)엔 제출확인(→Step5)만. Step4에도 "저장하기" 추가. ⚠️ `IoBundleCart`는 **데스크톱 공유** → 모바일 전용으로 스코프(prop 분기)해야 PC 무변경. (이전 플랜의 "저장은 Step5만(PC 동일)" 결정을 사용자 요청으로 갱신.)
- **확정 2 — "저장 안 하고 나가기" 버튼**: `MobileDirtyLeaveSheet`(모바일 전용)는 현재 2갈래("임시저장하고 이동"=flush 후 전환 / "계속 작성"=잔류). **3번째 옵션 추가** — 저장 안 하고 그냥 나가기 = draft 저장 없이 묶음 폐기 후 전환. 구현 시 폐기 경로 필요(`state.setBundles([])` + `beginNewCompositionSlot()`로 슬롯 초기화).
- 관련 파일: `_warehouse_v2/IoBundleCart.tsx`(Step4 저장 버튼·모바일 스코프), `mobile/warehouse/MobileDirtyLeaveSheet.tsx`(3번째 버튼), `mobile/MobileShell.tsx`·`mobile/screens/MobileWarehouseScreen.tsx`(onConfirm/onDiscard 분기), `mobile/warehouse/MobileIoComposeWizard.tsx`(draft flush/폐기).

### 3-5. 더보기 — 주간보고/창고지도 세로 1열 큰 타일
- [x] 화면: 더보기 탭. 2-8에서 2열 그리드 큰 카드로 했는데, **불량 허브 첫 화면처럼 세로로 쭉 1열 크게**. — 완료·푸시(2026-06-22)
- 수정: `MobileMoreScreen.tsx` — `grid grid-cols-2`(23줄) → `flex min-h-0 flex-1 flex-col gap-3`, `BigCard`를 불량 허브 카드 패턴(`flex min-h-[96px] flex-1 items-center gap-5`, 아이콘 박스 h-16 w-16)으로. (2-8 결과를 갱신.)
- PC 무변경: 모바일 전용.

### 3-6. 아이콘 색 — 입출고(모바일) + PC 좌측 사이드바
- [x] 입출고 아이콘에 색 추가(불량·더보기엔 있는데 입출고엔 없음). 어울리는 색 아무거나(큰 의미 없음). 보기 좋으면 유지. — 완료·푸시(2026-06-22): 모바일 입출고 아이콘 + PC 사이드바 아이콘 탭별 색
- 모바일 입출고: `MobileWorkTypeStep.tsx`(65줄) 작업유형 카드 아이콘에 `style={{ color: active ? accent : … }}` 추가(이미 `accent`=입고 blue/출고 red 존재).
- **PC 좌측 사이드바(의도된 PC 변경)**: `DesktopSidebar.tsx`(176–185) 아이콘이 현재 활성=white/비활성=muted2 단색. `DesktopMesShell.tsx`의 `TAB_META`(33–41)에 탭별 `color` 필드 추가 → 사이드바 아이콘에 탭 고유색. "이쁘면 그대로 유지".
- 관련 파일: `mobile/warehouse/MobileWorkTypeStep.tsx`, `DesktopSidebar.tsx`, `DesktopMesShell.tsx`. (입출고 섹션 탭 `WarehouseSectionTabs`는 아이콘 자체가 없어 대상 아님.)

### 3-7. 대시보드 품목 카드 — "이미지 보기" 버튼(팝업)
- [x] 화면: 모바일 대시보드 품목 클릭 카드(`InventoryDetailPanel`). 인라인 미리보기는 모바일 공간 한계 → **"이미지 보기" 버튼** 누르면 팝업으로 이미지, 닫기. — 완료·푸시(2026-06-22): 사진 없는 품목은 비활성 "이미지 없음" 표시
- **코드 확인**: `InventoryDetailPanel`에 이미 라이트박스 팝업 있음(`lightboxOpen` + `ImageLightbox`, 71–98줄). 단 모바일 호출(`MobileDashboardScreen.tsx` 355–363)이 **`imageFilename`을 안 넘겨** 현재 모바일엔 이미지가 안 뜸. 파일명은 `imageManifest[item.mes_code]` 매핑(데스크톱 패턴 `DesktopInventoryView:239`).
- 수정: ① `MobileDashboardScreen`에서 `imageFilename` 전달 ② 모바일 변형(`quickActionVariant==="mobile"`)에선 인라인 썸네일 대신 **"이미지 보기" 버튼** → 기존 `ImageLightbox` 팝업 오픈. 재사용: `@/lib/ui/ImageLightbox`.
- PC 무변경: 버튼은 모바일 변형 구간에만. 데스크톱은 현행 인라인 썸네일 유지.

---

## 4차 수집 (시작: 2026-06-22)

> 형식은 1·2·3차와 동일(화면·문제·수정 방향·관련 파일·PC 무변경 주의). "구현해"라고 할 때까지 수집·정리만.

### 4-1. 로그인 화면 — 로고 크게
- [ ] 화면: 로그인 화면, 카드 위 영구 로고(`MesLoginGate.tsx`). 현재 카드 상단에 작게 떠 있음.
- 문제: 인트로 후 카드 위로 이동한 로고가 작음 → 더 크게.
- **현재 코드(확인됨)**: 인트로 자연크기 840px → `SHRINK_TRANSFORM = scale(0.333) translateY(calc(-75vh - 420px))`로 축소(=280px 폭). 위치 공식 `T·s = 25vh + 140px`(로고 중심 = 카드 상단의 절반 지점)로 유지됨.
- 수정 방향: `scale`만 키우고 `translateY`를 공식대로 재계산해 위치 유지. 예) `scale(0.4)` → 폭 336px, `T = (25vh+140)/0.4 = 62.5vh+350px` → `scale(0.4) translateY(calc(-62.5vh - 350px))`. 카드 흰박스 폭 ~384px(`OperatorLoginCard` maxWidth 440·padding 16)이라 0.45(378px)까지 여유. 최종 배율은 구현 시 확정.
- 관련 파일: `frontend/app/mes/_components/login/MesLoginGate.tsx` (`SHRINK_TRANSFORM` 상수 + 위 주석 위치 공식).
- **PC 무변경 주의**: `MesLoginGate`는 모바일·데스크톱 **공용** 로그인 게이트 → 키우면 양쪽 다 커짐. 모바일만 키울지 공용으로 키울지 구현 전 확인(현재 의도는 공용으로 추정).

### 4-2. 대시보드 — 검색창 위 틈새(스크롤 시) 제거
- [ ] 화면: 모바일 대시보드. 스크롤하면 sticky 검색바와 헤더 사이에 띠 같은 틈이 보임.
- **원인(코드 확인)**: 검색바 div(`sticky top-0 z-10 bg=s1`, `MobileDashboardScreen.tsx` 247–249)가 **`card` section 안에** 들어 있음(243줄 card + 연파랑 그라데이션 배경). 스크롤로 검색바가 top-0에 붙으면 그 위로 ① card 상단 여백+둥근 모서리(그라데이션) ② 그 위 스크롤 컨테이너 배경(`LEGACY_COLORS.bg`)이 겹쳐, s1/그라데이션/bg 3색이 띠로 갈라져 보임. 데스크톱은 검색을 card 밖 독립 sticky 헤더로 분리해 이 문제가 없음.
- **확정 방식 (사용자 선택 2026-06-22 — 검색바 독립 분리)**: 데스크톱처럼 검색/필터 바를 `card` section **밖으로 빼서** 스크롤 컨테이너(`scrollbar-hide overflow-y-auto`, 171줄) 직속 sticky 막대로. 헤더 바로 아래 딱 붙어 틈이 근본 제거되고 PC와 구조 통일. 품목 목록(현재 같은 card 안)만 카드로 남김.
- 관련 파일: `frontend/app/mes/_components/mobile/screens/MobileDashboardScreen.tsx` (169–301줄: 스크롤 컨테이너 / KPI section / 검색 card / sticky 검색바 / 필터칩 / 목록 구조 재배치).
- 구현 주의: ① 검색바를 card 밖으로 빼면 sticky 기준이 스크롤 컨테이너가 되므로 `top-0` 그대로 동작. ② 4차 진행 전 이미 별개 항목인 1차 #2(필터칩 sticky 밖 분리)와 충돌 없는지 확인 — 현재 필터칩은 이미 card 안 sticky 밖(298–301줄). 재배치 시 칩도 함께 정리. ③ 검색바 배경(s1)과 헤더 영역 색 경계 확인.
- PC 무변경: `MobileDashboardScreen`은 모바일 전용 → 데스크톱 영향 없음.

### 4-3. 입출고 Step1 작업 유형 카드 — 아이콘·텍스트 훨씬 크게
- [ ] 화면: 입출고 Step1(작업 유형 선택) "창고 입출고 / 부서 입출고" 카드. 카드는 `flex-1`로 화면 높이를 꽉 채워 크지만, 아이콘·글자가 작아 카드 안에 빈 공간이 많음.
- 요구: 아이콘·텍스트를 **훨씬 크게**(단 자연스럽게).
- **현재 값(코드 확인, `MobileWorkTypeStep.tsx` 61–76)**: 아이콘 박스 `h-16 w-16`(64px), 아이콘 `h-8 w-8`(32px), 제목 `text-xl font-black`(20px), 설명 `text-base`(16px), 카드 내부 gap `gap-5`.
- 수정 방향(예시, 구현 시 실기 보며 확정): 아이콘 박스 `h-20 w-20`~`h-24 w-24`(80~96px), 아이콘 `h-10 w-10`~`h-12 w-12`(40~48px), 제목 `text-2xl`~`text-3xl`, 설명 `text-lg`, gap `gap-6`. 두 카드(창고/부서) 동일 map이라 한 번에 적용됨.
- 관련 파일: `frontend/app/mes/_components/mobile/warehouse/MobileWorkTypeStep.tsx` (48–77줄 작업 유형 버튼).
- 참고: 2-3 Fix2에서 이미 한 차례 키운 값(h-12→h-16 등)에서 **추가로 더** 키우는 것.
- PC 무변경: 모바일 전용 컴포넌트(데스크톱은 `IoWorkTypeStep` 별도).

### 4-4. 입출고 Step2 — 버튼 꽉 채워 키우기 + "다음 단계로" 푸터 배경·그림자 제거
- [ ] 화면: 입출고 Step2(세부 작업과 부서). 세부 작업(2개)·도착 부서(6개) 버튼 사이/안에 공백 큼. 하단 "다음 단계로" 버튼만 회색 띠 배경+그림자.
- **(A) 버튼 꽉 채워 키우기**:
  - 현재(코드 확인, `MobileWorkTypeStep.tsx`의 `MobileSubTypeStep`): 각 섹션이 `flex flex-1 flex-col justify-center`(166·169·242·272·288줄)라 **버튼이 가운데로 모이고 위아래 여백**이 큼. 세부 작업 그리드 `grid-cols-2 gap-2.5` 버튼 `min-h-[64px]`(244·252줄), 도착 부서(`DeptGrid` 107·119줄) `grid-cols-3 gap-2` 버튼 `min-h-[48px]` `text-base`.
  - 수정 방향: `justify-center` 제거 → 그리드/버튼이 섹션 높이를 **꽉 채우게**(그리드 `h-full` + 버튼 `h-full`, 또는 버튼 `flex-1`). 버튼이 커진 만큼 텍스트도 확대(세부작업 `text-base`→`text-lg`, 설명 키움 / 부서 `text-base`→`text-lg`~`text-xl`). 배경 공백 최소화.
  - 주의: `DeptGrid`는 process/non-process 분기 양쪽에서 쓰는 공유 함수(둘 다 모바일) → 키우면 양쪽 부서 그리드 모두 커짐(의도와 일치).
- **(B) "다음 단계로" 푸터 배경·그림자 제거**:
  - 현재(코드 확인): `MobileIoComposeWizard.tsx` 618–629줄에서 `<StickyFooter>`로 감쌈. `StickyFooter`(`primitives/StickyFooter.tsx`)는 `background: s1` + `border-t` + `boxShadow: 0 -12px 24px rgba(0,0,0,.24)`를 **인라인 style**로 가짐 → className으로 못 덮음.
  - 수정 방향: `StickyFooter`에 `flat`(또는 `transparent`) prop 추가 → 배경·border·shadow 제거. **Step2 호출처에만** 적용. ⚠️ `StickyFooter`는 불량 카트·Step4 등 **여러 곳 공유** → prop 기본값은 현행 유지(배경 있음), Step2만 `flat`로 opt-in해야 다른 화면 영향 없음.
  - 확인 필요: 배경 없애면 sticky 버튼 뒤로 스크롤 콘텐츠가 비칠 수 있음. Step2는 (A) 적용 후 화면을 꽉 채워 스크롤이 거의 없을 것이라 괜찮을 가능성 — 구현 시 실기 확인.
- 관련 파일: `frontend/app/mes/_components/mobile/warehouse/MobileWorkTypeStep.tsx`(A), `frontend/app/mes/_components/mobile/primitives/StickyFooter.tsx` + `mobile/warehouse/MobileIoComposeWizard.tsx`(B).
- PC 무변경: 전부 모바일 전용. `StickyFooter`는 모바일 primitive(데스크톱 미사용).

### 4-5. 입출고 Step3 — 모바일에서 "순서 편집" 버튼 숨기기
- [ ] 화면: 입출고 Step3(대상 선택) 품목 목록 우상단 "⚙ 순서 편집" 버튼. 모바일에선 드래그 편집이 불편 → 버튼 자체를 없애 깔끔하게.
- **코드 확인**: `IoTargetPicker.tsx` 276–288줄 "순서 편집" 버튼(`enterEditMode`). 이 picker는 **PC 공유**(231줄 주석·232줄 `lg:` 분기 존재).
- 수정 방향: 버튼(또는 감싼 컨테이너)에 `hidden lg:flex`(또는 `lg:` 표시 분기)를 줘서 **<1024px(모바일)에서만 숨김**, PC(`lg:`)는 현행 유지. 편집 모드 진입 자체가 막히므로 취소/초기화 버튼 등 후속 UI도 모바일엔 안 뜸(기능 코드는 보존 — 숨김만).
- 관련 파일: `frontend/app/mes/_components/_warehouse_v2/IoTargetPicker.tsx` (276–289줄 버튼 + 그 부모 컨테이너).
- PC 무변경: `lg:` 분기로 데스크톱은 순서 편집 기능 그대로 유지(숨김은 모바일 한정).

### 4-6. 입출고 Step3 — "수량 조정 →" 버튼 영역 배경 제거 (4-4 (B)와 동일 취지)
- [ ] 화면: 입출고 Step3(대상 선택) 하단 "수량 조정 →" 버튼. 아까 "다음 단계로"처럼 버튼 영역에 배경 띠가 있음 → 없애자.
- **코드 확인**: `IoTargetPicker.tsx` 370줄 sticky 컨테이너 — 모바일은 `border-t border-[var(--c-border)] bg-[var(--c-s1)]`, PC는 이미 `lg:static lg:border-0 lg:bg-transparent`로 투명. (그림자는 없음, 상단 선 border-t + 배경 bg-s1만.)
- 수정 방향: 모바일에서도 배경·상단 선 제거 → `bg-[var(--c-s1)]`·`border-t border-[var(--c-border)]` 제거(또는 모바일에서 `bg-transparent border-0`). PC(`lg:`)는 이미 투명이라 영향 없음.
- ⚠️ 확인 필요(4-4 (B)와 동일): Step3는 품목 목록이 길어 **스크롤됨** → 배경 없애면 sticky 버튼 뒤로 목록 글자가 비쳐 가독성 저하 가능. 구현 시 실기 확인(필요 시 버튼 자체 배경/그림자로 가독성만 확보하고 띠 배경만 제거하는 절충).
- 관련 파일: `frontend/app/mes/_components/_warehouse_v2/IoTargetPicker.tsx` (370줄 sticky 컨테이너 className).
- PC 무변경: 해당 컨테이너는 이미 `lg:` 분기로 PC 정적·투명 → 모바일 className만 수정.

### 4-7. 입출고 Step4(품목 확인) — 긴 이름 / 가능재고·실행후 정렬 / 저장·제출확인 배경
- [ ] 화면: 입출고 Step4(품목 확인). 세 가지.
- **(A) 긴 품목 이름 — 탭하면 펼쳐 전체 (사용자 선택 2026-06-22)**:
  - 현재(코드 확인): 번들 제목 `IoBundleCard.tsx` 154줄 `truncate`, 자식 라인 품목명 `IoLineRow.tsx` 158줄 `truncate` → 1줄 잘림.
  - 수정 방향: 2-1(대시보드 하위구성)과 동일 패턴 — 기본 1줄 truncate, **이름 탭 시 그 항목만 전체 이름 펼침**(다시 탭하면 접힘). 자식 라인(`IoLineRow`)·번들 제목(`IoBundleCard`) 둘 다 적용. 펼침 상태 로컬 state.
  - ⚠️ 스코프: `IoBundleCard`/`IoLineRow`는 **PC 공유**(데스크톱은 hover/`title`로 전체 확인 가능) → 탭 펼침은 **모바일 전용**으로 한정(variant prop 또는 모바일에서만 탭 핸들러). PC 현행 유지. (2-1에서 쓴 `tapToExpandName` 류 패턴 참고.)
- **(B) 가능 재고 / 실행 후 — 가운데 정렬**:
  - 현재(코드 확인): 자식 라인 `IoLineRow.tsx` 248·264줄, 번들 `IoBundleCard.tsx` 267·281줄 모두 `text-right`(우측 정렬).
  - 수정 방향: 모바일에서 가운데 정렬 → `text-center`. PC 공유라 `text-center lg:text-right`로 **모바일만** 가운데, PC 우측 정렬 유지. (스크린샷은 자식 라인 기준이나 일관성 위해 번들 쪽도 동일 처리 검토.)
- **(C) 저장 / 제출확인 푸터 배경 제거 (4-6과 동일 취지)**:
  - 현재(코드 확인): `IoBundleCart.tsx` 125줄 sticky 푸터 — 모바일 `border-t border-[var(--c-border)] bg-[var(--c-s1)]`, PC는 이미 `lg:border-0 lg:bg-transparent`. 저장(3-4 추가)·제출확인 버튼이 이 안에.
  - 수정 방향: 모바일에서도 `bg-[var(--c-s1)]`·`border-t` 제거. ⚠️ 4-6과 동일하게 sticky 버튼 뒤로 품목 카드가 비칠 수 있어 가독성 실기 확인.
- 관련 파일: `frontend/app/mes/_components/_warehouse_v2/IoBundleCard.tsx`(A·B), `IoLineRow.tsx`(A·B), `IoBundleCart.tsx`(C).
- PC 무변경: 셋 다 PC 공유 컴포넌트 → 전부 모바일 스코프(`lg:` 또는 variant prop)로 처리해 데스크톱 영향 0.

### 4-8. 입출고 위저드 — 단계명 텍스트 제거 + STEP N/N을 우측으로
- [ ] 화면: 입출고 위저드 상단 게이지 바 아래 행. 우측에 현재 단계명("실제 반영"/"품목 확인"/"대상 선택" 등)이 뜨는데 필요 없음 → 없애고, 좌측의 "STEP N / N"을 그 자리(우측)로 옮김.
- **코드 확인**: `WizardProgress.tsx` 42–52줄. 게이지 바 아래 `flex justify-between` 행 — 좌측 `Step {current+1} / {steps.length}`(43–48줄), 우측 `{active?.label}` 단계명(49–51줄, blue·truncate).
- 수정 방향: ① 우측 단계명 span(49–51줄) **삭제** ② 컨테이너를 `justify-between`→`justify-end`(또는 Step span에 `ml-auto`)로 해서 `Step N/N`을 **우측 정렬**. (좌측엔 별도 뒤로(←) 버튼이 있으니 우측으로 옮기면 화살표와 안 겹침.)
- 관련 파일: `frontend/app/mes/_components/mobile/primitives/WizardProgress.tsx` (42–52줄).
- PC 무변경: `mobile/primitives` 모바일 전용(데스크톱 위저드는 별도 헤더).

### 4-9. 입출고 Step5 — 저장하기/결재요청 버튼을 Step4 스타일로 통일
- [ ] 화면: 입출고 Step5(최종 확인) 하단 "저장하기" + "창고 결재 요청 N건" 버튼. 이전 단계(Step4) 버튼보다 너무 크고 둥글어 따로 노는 느낌 → Step4처럼 통일.
- **코드 확인 — 차이**:
  - Step4(목표, `IoBundleCart.tsx` 147–166줄): 저장 `rounded-[14px] border px-5 py-3 text-sm`, 제출확인 `rounded-[14px] px-6 py-3 text-sm` + 아이콘 `h-4 w-4` + gap-1.5, 컨테이너 `gap-2`.
  - Step5(현재, `IoConfirmStep.tsx` 259–284줄): 저장하기 `rounded-[22px] border-2 px-6 py-7 text-base` + 아이콘 `h-5`, 결재요청 `rounded-[22px] px-7 py-7 text-xl` + 아이콘 `h-6 w-6` + gap-3, 컨테이너 `gap-3`.
- 수정 방향: Step5 버튼 두 개를 Step4 값으로 맞춤 — `rounded-[22px]`→`rounded-[14px]`, `border-2`→`border`, `py-7`→`py-3`, 패딩/글씨 `text-base`·`text-xl`→`text-sm`, 아이콘 `h-5`/`h-6`→`h-4`, 컨테이너 `gap-3`→`gap-2`. 결재요청은 accent 배경·흰 글씨 유지(색은 그대로, 크기/모서리만 통일).
- 관련 파일: `frontend/app/mes/_components/_warehouse_v2/IoConfirmStep.tsx` (259–284줄 액션 버튼 행).
- ⚠️ 스코프 확인: `IoConfirmStep`이 데스크톱 위저드와 공유인지 구현 시 확인. 공유라면 모바일 스코프(`lg:`로 PC는 현행 크기 유지)로, 아니면 그대로 변경. (Step4도 `onSaveDraft` 유무로 모바일/PC 분기하므로 동일 패턴 참고.)

### 4-10. 통일성 일괄 — 불량(바로 폐기/불량 격리) 흐름에 4-4~4-6 동일 적용
- [ ] 화면: 모바일 불량 탭 — 바로 폐기 / 불량 격리의 출처·부서 단계 + 품목 선택 단계. 입출고에서 정한 것들과 통일.
- **(A) 하단 버튼 영역 배경·그림자 제거 (4-4 (B)·4-6과 동일)**:
  - 코드 확인: `MobileDefectCartFlow.tsx` step1(283–285줄)·step2(386–398줄) 모두 `<StickyFooter>` 사용. "다음 →" "즉시 폐기 (N건)" "격리하기" 버튼이 그 안에.
  - 수정 방향: 4-4 (B)에서 `StickyFooter`에 추가할 `flat`(배경·border·shadow 제거) prop을 **이 호출처들에도 적용**. 입출고 Step2와 동일한 룩.
  - ⚠️ 같은 가독성 우려(sticky 뒤 콘텐츠 비침) — 실기 확인.
- **(B) 불량 품목 선택 "순서 편집" 버튼 숨김 (4-5와 동일 취지, 다른 컴포넌트)**:
  - 코드 확인: 불량 품목 선택은 `DefectItemPicker.tsx`(입출고 `IoTargetPicker`와 **별개**). 자체 "순서 편집" 버튼 198–210줄(`enterEditMode`).
  - 수정 방향: 4-5처럼 모바일에서 숨김. ⚠️ `DefectItemPicker`가 PC defect view와 공유인지 구현 시 확인 — 공유면 `lg:` 분기로 모바일만 숨김, 모바일 전용이면 단순 제거/숨김(기능 코드 보존).
- **(C) 출처·부서 버튼 꽉 채움 (4-4 (A)와 동일 톤)**:
  - 불량 출처(부서재고/창고재고)·부서 그리드 버튼도 입출고 Step2와 동일하게 공백 최소화·크기 통일. 불량 부서 그리드가 입출고 `DeptGrid` 공유인지/별도인지 구현 시 확인 후 톤 맞춤.
- 관련 파일: `frontend/app/mes/_components/mobile/screens/MobileDefectCartFlow.tsx`(A·C), `frontend/app/mes/_components/_defect_hub/DefectItemPicker.tsx`(B·C), + 4-4에서 만들 `StickyFooter` `flat` prop.
- PC 무변경: 불량 카트 흐름은 모바일 전용(`MobileDefectCartFlow`). `DefectItemPicker`만 PC 공유 여부 확인해 스코프 처리.
- 참고: 부서 입출고 흐름은 기존 1차 #18에서 "창고 입출고와 동일 컴포넌트 공유로 자동 반영" 정리됨 → 4-4~4-9 입출고 수정 시 부서 입출고에도 대부분 자동 적용(구현 시 전용 분기만 확인).

### 4-11. 불량 품목 선택 — "담김" 버튼을 "추가"와 명확히 구분
- [ ] 화면: 불량(바로 폐기/격리) 품목 선택 목록 우측 "추가"/"담김" 버튼. 둘이 색이 같아 담긴 건지 한눈에 구분 어려움.
- **코드 확인**: `DefectItemPicker.tsx` 362–385줄. added 여부와 무관하게 **둘 다 `background: red` + 흰 글씨**(365–372줄 style 고정), 차이는 아이콘(`Plus`/`X`)·글자("추가"/"담김")뿐 → 색 동일이라 구분 약함.
- 수정 방향(제안, 구현 시 확정): 담김(added=true)은 **약한/아웃라인 룩**(흰 배경 + 빨강 테두리 + 빨강 글씨, 아이콘 `Check` 또는 `X`), 추가(added=false)는 현행 **빨강 솔리드 강조** 유지. → "아직 안 담김=강조, 담김=차분" 대비로 상태 즉시 구분. style을 added 분기로 나눔.
- 관련 파일: `frontend/app/mes/_components/_defect_hub/DefectItemPicker.tsx` (362–385줄 버튼 style).
- ⚠️ 스코프: `DefectItemPicker`가 PC defect view와 공유인지 확인(4-10 (B)와 동일 미확인 사항). 공유면 PC에도 동일 적용해도 무방한 순수 시각 개선이라 큰 문제 없지만, 구현 시 PC 렌더 확인.

### 4-12. 내역 달력 — 카운트 라벨 "건" 줄바꿈 방지(두 자리까지 한 줄)
- [ ] 화면: 내역 탭 월 뷰 달력 각 날짜 칸의 "창고 N건 / 부서 N건 / 조정 N건" 라벨. 모바일 5열 좁은 칸에서 "건"이 다음 줄로 떨어짐(예: "부서 36" + 줄바꿈 "건"). 두 자리 수까지는 줄바꿈 없이 한 줄로.
- **코드 확인**: `HistoryCalendarStrip.tsx` 253–267줄. `창고 {warehouseCount}건` 등 `text-[11px] font-bold leading-tight` span. `whitespace-nowrap` 없어 칸 폭 부족 시 줄바꿈. (2-6에서 모바일만 `hideWeekends`로 5열 → 칸이 더 좁아 발생. 데스크톱은 7열이지만 폭이 넓어 한 줄.)
- 수정 방향(택1, 구현 시 확정): ① 각 라벨 span에 `whitespace-nowrap` 추가(가장 간단, "건" 유지 — 두 자리까진 11px로 칸 안에 들어감) / ② "건" 글자 제거해 "창고 31"처럼 짧게(색으로 종류 구분되므로 의미 유지) / ③ 폰트 `text-[11px]`→`text-[10px]` 미세 축소 병행. 세 자리(100건+)는 드물어 후순위.
- 관련 파일: `frontend/app/mes/_components/_history_sections/HistoryCalendarStrip.tsx` (253–267줄).
- ⚠️ PC 공유: 이 컴포넌트는 데스크톱(`DesktopHistoryView`)과 공유(2-6 정정 참고). `whitespace-nowrap`은 데스크톱(이미 한 줄)에 무해하나, "건" 제거 등 텍스트 변경은 데스크톱에도 반영됨 → 모바일만 바꾸려면 `lg:` 분기, 양쪽 동일해도 무방하면 공통 적용. 구현 시 결정.

### 4-13. 주간보고 모바일 — 세로 유지하며 생산현황을 PC 매트릭스 표처럼
- [ ] 화면: 주간보고 모바일(`MobileWeeklyScreen`). 데스크톱과 달라 보임. **세로 레이아웃 유지**하되 PC처럼 보이게(사용자 결정 2026-06-22: "세로로 그냥 PC처럼 보이게 해보자" — 가로 회전 X).
- **핵심 사실(코드 확인)**: 모바일 주간보고는 이미 frozen 하위를 재사용 중 —
  - "공정별 변화" = `WeeklyGroupCards`(cols=1), "품목 상세" = `WeeklyDetailTable` → **둘 다 PC와 동일 컴포넌트**(이미 같음, 변경 불필요).
  - **PC와 다른 곳은 "생산 현황" 한 곳뿐**: PC는 가로 와이드 매트릭스 표 `WeeklyProductionMatrix`(frozen), 모바일은 좁은 폭 때문에 `MobileProductionMatrixCards`(모델별 카드, 스크린샷 COCOON/DX3000)로 대체했었음(`MobileWeeklyScreen.tsx` 116줄, 주석 23줄).
- 수정 방향: "생산 현황" 섹션에서 `MobileProductionMatrixCards`(116줄) → frozen **`WeeklyProductionMatrix`** 로 교체하고, 세로 화면 안에서 **가로 스크롤 래퍼**(`overflow-x-auto`)로 감싸 PC와 동일 표를 보이게. KPI 배지 줄·나머지 섹션은 현행 유지.
- ⚠️ **동결 준수**: `WeeklyProductionMatrix`/`WeeklyGroupCards`/`WeeklyDetailTable`/`DesktopWeeklyReportView`/`weekly_report.py`는 **수정 금지** — `WeeklyProductionMatrix`를 **import만** 해서 재사용(2-10 창고지도에서 PC 컴포넌트 재사용한 것과 동일 원칙). MobileWeeklyScreen만 수정.
- 구현 시 확인: `WeeklyProductionMatrix`가 393px 폭에서 가로 스크롤로 정상 표시되는지(최소폭·셀폭). 깨지면 래퍼 `min-w`/`overflow-x-auto`로 보정. 교체 후 `MobileProductionMatrixCards`가 다른 곳에서 안 쓰이면 사용처 0 확인 후 정리(쓰이면 보존).
- 관련 파일: `frontend/app/mes/_components/mobile/screens/MobileWeeklyScreen.tsx`(수정), `_weekly_sections/WeeklyProductionMatrix.tsx`(import만·수정금지), `mobile/weekly/MobileProductionMatrixCards.tsx`(교체로 사용 안 하게 될 수 있음).
- PC 무변경: 데스크톱 주간보고 전체 동결 — 손대지 않음. 모바일 화면만 변경.

---

## 5차 수집 (시작: 2026-06-23)

> 형식은 1~4차와 동일(화면·문제·코드 확인·수정 방향·관련 파일·PC/공유 무변경 주의). "구현해"라고 할 때까지 수집·정리만.

### 5-1. 불량(격리/바로 폐기) Step1 출처 — "부서 재고 / 창고 재고" 버튼 키워 비율 개선
- [ ] 화면: 모바일 불량 탭 Step1(출처·부서). 상단 `출처` 토글("부서 재고"/"창고 재고")이 얇은 띠라, 그 아래 화면을 꽉 채우는 큰 부서 그리드(튜브~출하 6타일)와 대비돼 너무 작아 보임 → 토글을 키워 위아래 비율을 맞추고 싶음.
- **코드 확인**: `MobileDefectCartFlow.tsx` 221–228줄에서 `SegmentedControl`로 렌더(`{id:"production",label:"부서 재고"},{id:"warehouse",label:"창고 재고"}`). 실제 크기는 `SegmentedControl.tsx`에 하드코딩 — 트레이 `rounded-[14px] border p-1`(31줄), 버튼 `px-2 py-[7px] rounded-[10px]` + `TYPO.caption`(작은 글씨)(44–45줄). → 높이·글자가 작아 띠처럼 보이는 원인.
- ⚠️ **공유 컴포넌트 주의**: `SegmentedControl`은 모바일 primitive로 **여러 곳 공유**(`ItemDetailSheet` · History 등, 14–15줄 주석). 컴포넌트 자체 패딩/글씨를 키우면 그 화면들 토글도 다 같이 커짐 → **금지**.
- 수정 방향(택1, 구현 시 확정):
  1. **(권장) opt-in `size` prop 추가** — `SegmentedControl`에 `size?: "md" | "lg"`(기본 `"md"`=현행). `"lg"`일 때만 버튼 `py`·글자 키움(예: `py-[7px]`→`py-3`, `TYPO.caption`→`TYPO.body`/`title` 급), 트레이도 `p-1`→`p-1.5`. 불량 Step1 호출처(221줄)에만 `size="lg"` 적용 → 다른 화면 무영향. 4-4(B) `StickyFooter flat` opt-in과 동일 패턴.
  2. (대안) 불량 Step1에서 `SegmentedControl` 대신 출처 2버튼을 부서 그리드 톤(`min-h-[52px] rounded-[14px]`)에 맞춘 전용 2-grid 토글로 교체. 공유 컴포넌트는 안 건드리지만 코드 중복.
- 비율 메모: 부서 그리드 타일은 `min-h-[52px]`(255·265줄) + `flex-1`로 높이를 채움. 출처 토글 버튼 높이를 그 절반~동급(대략 `py-3`≈44px대)까지 올리면 "작은 머리/큰 몸통" 불균형이 완화됨. 정확한 값은 실기 보며 확정.
- 관련 파일: `frontend/app/mes/_components/mobile/primitives/SegmentedControl.tsx`(size prop 추가 시), `frontend/app/mes/_components/mobile/screens/MobileDefectCartFlow.tsx` 221–228줄(호출처).
- PC 무변경: `MobileDefectCartFlow`는 모바일 전용. `SegmentedControl`은 공유라 **반드시 opt-in으로** 처리해 타 화면 토글 영향 0.

> **선행 메모(이번 세션 2026-06-23 완료, 미커밋·미배포):** 4-1 로고가 모바일에서 안 커 보이던 진짜 원인 = Tailwind 전역 `img { max-width:100% }`가 `width:840`을 덮어 모바일(폭<840)에서 로고 폭을 뷰포트로 캡(414×0.45=186px, 의도 378px의 절반). → `MesLoginGate.tsx` img style에 `maxWidth:"none"` 추가로 해결(840×0.45=378px, PC는 원래 840이라 무변경). 아래 5-2·5-3은 이 수정으로 로고가 378px가 된 뒤 따라오는 후속 정비.

### 5-2. 로그인 인트로 애니메이션 — 방향 반전(작게 시작 → 크게 안착)
- [ ] 화면: 로그인 인트로 시퀀스(`MesLoginGate`). 현재 로고가 처음 크게(모바일에선 화면 밖으로 넘침) 떴다가 작아지며 카드 위로 이동.
- **원인(코드 확인)**: 위 maxWidth 수정으로 `width:840`이 살아나, 인트로 첫 상태 `CENTER_TRANSFORM = scale(1) translateY(0)`(21줄)이 **840px** → 모바일(414px)에서 ~2배로 넘쳐 잘림. 600ms 후 `SHRINK_TRANSFORM = scale(0.45)` above-card(20·99줄)로 transition 0.9s(134줄) 축소. inner div의 `mes-logo-fade-in`(`globals.css` 218–221: scale .88→1·opacity 0→1, 140줄 0.5s)이 outer scale과 곱해짐. → 현재는 "큰 채로 등장 → 축소" 흐름.
- **요구(사용자)**: 처음엔 화면에 **다 보이게 작게** 시작 → 완료되면 **큰 최종 상태**로 안착. (즉 작게→크게로 반전)
- 수정 방향(구현 시 값 확정): 인트로 시작 스케일을 final(0.45=378px)보다 **작게**(화면에 들어오는 값, 예 scale~0.3≈252px 중앙) 두고, final above-card(378px)로 **키우며** 이동. big→small 가정으로 짜인 CENTER/SHRINK 관계와 위치 공식(16–17줄)도 함께 재계산. `mes-logo-fade-in`의 scale(.88→1)이 outer scale과 **이중 곱**되는 점 주의(필요 시 keyframe의 scale 제거하고 opacity만).
- 관련 파일: `frontend/app/mes/_components/login/MesLoginGate.tsx`(20–21·96–103·130–152줄), `frontend/app/globals.css`(218–221 keyframe).
- ⚠️ 공용: `MesLoginGate`는 PC·모바일 **공용**. PC에선 `scale(1)=840`이 안 넘쳐 인트로가 멀쩡할 수 있음(모바일만 깨짐). 반전 적용 시 PC 인트로도 같이 바뀌므로 PC도 어색하지 않은지 확인(필요 시 뷰포트 분기).

### 5-3. 로그인 로고 커진 후 — 배치·정렬 재조정
- [ ] 화면: 로그인 폼 단계, 카드 위 영구 로고(378px로 커짐). 로고↔카드 간격·세로 위치가 커진 크기에 안 맞아 보임.
- **코드 확인**: 위치 공식 주석(12–18줄) — 로고 중심 = `25vh-140px`(페이지 top과 카드 top의 중간)으로 계산, `SHRINK_TRANSFORM` translateY=`calc(-55.56vh-311.11px)`(20줄), 카드 상단 = `50vh-280px`(13줄). 이 상수들은 **378px 로고 기준 재검토 필요**(예전 280px 가정 잔재 가능).
- **요구(사용자)**: 로고가 커진 만큼 로고↔카드 간격·정렬 다시 잡기.
- 수정 방향(구현 시 실기 보며): 378px(높이 ~126px) 기준으로 로고 중심 Y·카드와의 여백 재계산 → translateY 상수·카드 marginTop 조정. **5-2의 애니메이션 최종 위치와 한 번에 맞추는 게 효율적**(5-2와 함께 구현 권장).
- 관련 파일: `frontend/app/mes/_components/login/MesLoginGate.tsx`(12–21 위치 공식·상수 + 카드 렌더), `frontend/app/mes/_components/login/OperatorLoginCard.tsx`(카드 maxWidth/marginTop 관련 시).
- ⚠️ 공용: PC·모바일 공용 → 위치 상수 변경은 PC 로그인 레이아웃에도 반영됨. PC도 확인.

### 5-4. 입출고 Step3 — "수량 조정 →" 버튼을 하단 네비바에 더 근접(리스트 영역 확대)
- [ ] 화면: 입출고 Step3(대상 선택) 하단 sticky "수량 조정 →" 버튼. 버튼과 하단 네비바 사이 빈 간격이 있어 품목 리스트가 그만큼 좁음 → 버튼을 네비바 쪽으로 더 붙여 리스트를 더 크게.
- **코드 확인(간격 출처 2곳)**: ① `IoTargetPicker.tsx` 372줄 sticky 푸터 `sticky bottom-0 ... px-4 pb-3 pt-3 lg:static lg:p-0`의 `pb-3`(버튼 아래 12px). ② 이를 감싼 위저드 스크롤 컨테이너 `MobileIoComposeWizard.tsx` 502줄 `min-h-0 flex-1 overflow-y-auto px-3 pb-3`의 `pb-3`(컨테이너 하단 12px). 둘이 합쳐져 버튼이 네비바에서 떠 있음.
- **요구(사용자)**: 버튼을 네비바 위로 더 근접 → 품목 리스트 가시 영역 키우기.
- 수정 방향(구현 시 실기 확인): 푸터 `pb-3`→`pb-1`/`pb-0`로 축소(+필요 시 502줄 컨테이너 하단 pb도 축소) → sticky 버튼이 네비바 바로 위에 붙어 리스트 영역 증가. 단 네비바와 완전히 맞붙어 답답하지 않게 최소 여백은 남길지 실기 보며 결정.
- 관련 파일: `frontend/app/mes/_components/_warehouse_v2/IoTargetPicker.tsx`(372줄 푸터 패딩), `frontend/app/mes/_components/mobile/warehouse/MobileIoComposeWizard.tsx`(502줄 스크롤 컨테이너 pb).
- PC 무변경: 푸터는 `lg:static lg:p-0`로 PC 패딩 이미 리셋, `MobileIoComposeWizard`는 모바일 전용 → PC 영향 0.

### 5-5. 입출고 Step4(품목 확인) — 저장/제출확인 푸터 근접 + 모바일 휴지통 버튼 축소
- [ ] 화면: 입출고 Step4(품목 확인). 두 가지.
- **(A) 저장/제출확인 푸터를 하단 네비바에 근접 (5-4와 동일 취지)**:
  - 코드 확인: `IoBundleCart.tsx` 126줄 sticky 푸터 `sticky bottom-0 ... mt-auto ... px-4 pb-3 pt-3 lg:static lg:pb-0 lg:pt-1`의 `pb-3`. + 위저드 스크롤 컨테이너 `MobileIoComposeWizard.tsx` 502줄 `pb-3`(Step3·Step4 **공용** 스크롤 영역 — 580=Step3, 609=Step4 둘 다 이 안). → 5-4와 같은 간격 출처.
  - 요구(사용자): 저장·제출확인 버튼을 네비바 쪽으로 더 붙이기.
  - 수정 방향: 5-4와 동일하게 푸터 `pb-3` 축소(+필요 시 502줄 컨테이너 pb). ⚠️ 502줄 컨테이너 pb는 위저드 전 스텝 공용 → 한 번 줄이면 5-4와 함께 반영됨(**5-4·5-5A 같이 구현 권장**, 중복 방지).
  - 참고: 현재 4-7C로 푸터 배경이 제거돼 버튼 뒤로 품목 카드(가능재고 200/199)가 비쳐 보임. 위치 근접과 별개 사안이나 함께 볼 것.
- **(B) 모바일 휴지통(묶음 삭제) 버튼 크기 축소**:
  - 코드 확인: `IoBundleCard.tsx` 297–305줄 묶음 삭제 버튼 — `h-12 w-12`(48px) 원형 + `Trash2 h-7 w-7`(28px). 모바일 `absolute right-0 top-0`, 데스크톱 `lg:static lg:self-center`. **크기엔 lg: 분기 없음**(양쪽 48px).
  - 요구(사용자): 모바일에서 휴지통 버튼 사이즈 축소.
  - 수정 방향(구현 시 값 확정): 모바일 기본만 줄이고 데스크톱은 lg:로 현행 유지 — 예 버튼 `h-9 w-9 lg:h-12 lg:w-12`(36/48px), 아이콘 `h-5 w-5 lg:h-7 lg:w-7`(20/28px).
  - ⚠️ 스코프: `IoBundleCard`는 PC 공유 → **반드시 lg: 페어**로 모바일만 축소, PC 48px 유지. (자식 라인 `IoLineRow`의 삭제 버튼도 별도면 톤 맞출지 구현 시 확인.)
- 관련 파일: `frontend/app/mes/_components/_warehouse_v2/IoBundleCart.tsx`(A 푸터 126줄), `frontend/app/mes/_components/mobile/warehouse/MobileIoComposeWizard.tsx`(A 컨테이너 502줄), `frontend/app/mes/_components/_warehouse_v2/IoBundleCard.tsx`(B 휴지통 297–305줄).
- PC 무변경: 푸터·컨테이너는 lg:/모바일전용으로, 휴지통은 lg: 페어로 모바일만 축소 → PC 영향 0.

### 5-6. 입출고 Step4 — 자식 라인 "가능 재고 ↔ 실행 후" 간격 + 가운데 정렬
- [ ] 화면: 입출고 Step4(품목 확인) 각 자식 품목 카드 하단 "가능 재고 / 실행 후" 두 수치. 현재 좌측에 붙어 있고 둘 사이 간격도 좁음 → 간격 벌리고 쌍 전체를 가운데로.
- **코드 확인**: `IoLineRow.tsx` 가능재고 블록 252–265줄·실행후 블록 267–279줄(둘 다 이미 `text-center lg:text-right` — 4-7B에서 텍스트는 가운데로 됨). 부모 행 128–138줄 — 모바일 `flex flex-wrap items-center gap-x-3`, 데스크톱 `lg:grid`(7열). 수량 stepper(212줄)가 모바일에서 `w-full`이라 줄바꿈 → 가능재고·실행후가 다음 줄에 `gap-x-3`(12px)로 **좌측 정렬**돼 붙음. (각 텍스트만 center, 묶음 자체 위치는 좌측이라 가운데로 안 보임.)
- **요구(사용자)**: 두 수치 사이 간격 확보 + 쌍 전체를 행 가운데 정렬.
- 수정 방향(구현 시 값 확정): 가능재고+실행후 두 div를 **모바일 전용 래퍼**로 묶어 `flex w-full items-start justify-center gap-10 lg:contents` — `lg:contents`로 **데스크톱에선 래퍼가 사라져 기존 7열 그리드 그대로 유지**(PC 무변경), 모바일에선 `w-full justify-center`로 쌍이 가운데·`gap-10`(예)로 간격 확보. 각 블록 내부 text-center 유지.
- ⚠️ 번들 카드(`IoBundleCard.tsx` 267·281줄)도 동일한 가능재고/실행후 구조 → 일관성 위해 같이 처리할지 구현 시 확인(스크린샷은 자식 라인 기준).
- 관련 파일: `frontend/app/mes/_components/_warehouse_v2/IoLineRow.tsx`(252–279줄 + 모바일 래퍼 추가), (선택) `frontend/app/mes/_components/_warehouse_v2/IoBundleCard.tsx`.
- ⚠️ PC 무변경: `IoLineRow`는 PC 공유 → `lg:contents`로 데스크톱 7열 그리드·우측 정렬 그대로.

### 5-7. 입출고 Step5 ↔ Step4 버튼 — 위치 통일 + Step4 저장 버튼에 아이콘 추가
- [ ] 화면: 입출고 Step5(최종 확인) "저장하기 / 창고 결재 요청" 버튼. 크기·모서리·패딩은 4-9에서 이미 Step4와 통일됨(코드 확인 — IoConfirmStep 265·279줄 모바일 `rounded-[14px] py-3 text-sm`). **남은 차이 2가지(4-9 미포함)**:
- **(A) 버튼 위치가 Step4와 다름**:
  - 코드 확인: **Step4**(`IoBundleCart.tsx` 126줄)는 버튼 행이 `sticky bottom-0 mt-auto`로 **하단 고정**(콘텐츠 위로 떠 네비바 근처). **Step5**(`IoConfirmStep.tsx`)는 루트 `flex h-full flex-col`(192줄) + 내부 스크롤(230줄) 아래, 메모+버튼이 `mt-auto flex flex-col`(241줄) **비-sticky 블록**(260줄 버튼 행)으로 메모 밑에 위치 → Step4보다 위쪽·네비바와 간격 큼.
  - 요구(사용자): Step5 버튼 위치를 Step4와 동일하게(하단 고정/근접).
  - 수정 방향(구현 시 판단): Step5 버튼 행(260)을 Step4처럼 하단 sticky/네비바 근접으로. 메모 필드(242)와의 관계 결정 필요 — 메모도 같이 하단 고정할지, 메모는 스크롤 영역에 두고 버튼만 고정할지. **5-4·5-5A(네비바 근접)와 한 묶음으로 보는 게 효율적**(같은 "푸터를 네비바에 붙이기" 주제).
- **(B) Step4 "저장" 버튼에 아이콘 추가 (Step5엔 있음 → Step4에 맞춰 넣기)**:
  - 코드 확인: Step5 저장하기엔 `<Save className="h-4 w-4" />`(IoConfirmStep 272줄) 있음. Step4 "저장"(`IoBundleCart.tsx` 149–156줄)엔 아이콘 없음. IoBundleCart는 `import { ClipboardCheck }`만(3줄) → `Save` 미import.
  - 요구(사용자): **Step4 저장 버튼에도 Save 아이콘 추가**(제거 아님, 추가 방향). 라벨 "저장" 앞에 `<Save className="h-4 w-4" />`, import에 `Save` 추가, 버튼 className에 `flex items-center gap-1.5`(현재 아이콘 없어 flex 정렬 클래스 없을 수 있음) 보완.
- 관련 파일: `frontend/app/mes/_components/_warehouse_v2/IoConfirmStep.tsx`(A 버튼 위치 241·260줄), `frontend/app/mes/_components/_warehouse_v2/IoBundleCart.tsx`(A 참조 126줄 + B 저장 버튼 149–156줄·import 3줄), `frontend/app/mes/_components/mobile/warehouse/MobileIoComposeWizard.tsx`(A 스크롤 컨테이너 502줄).
- ⚠️ PC 무변경: 위치는 모바일 sticky 처리(lg:는 기존 정적 유지), Save 아이콘 추가는 PC에도 무해하나 IoBundleCart는 PC 공유라 데스크톱 저장 버튼에도 아이콘 들어감 — 의도와 맞는지 구현 시 확인(필요 시 모바일만).

### 5-8. 주간보고 모바일 — 공정 선택 시 화면 배치 흔들림(가로 오버플로우) 고정
- [ ] 화면: 주간보고 모바일 "공정별 변화" 카드. 공정(튜브/고압…)을 바꾸면 카드 배치가 흔들림 — 어떤 공정에선 카드 우측 "현재 N" 열·상단 "±0 변동없음" 배지가 화면 밖으로 잘려 안 보이고(스샷: 고압·DX3000), 다른 공정에선 정상 표시(스샷: 튜브). 배치를 공정과 무관하게 고정하고 싶음.
- **검증된 사실**: `WeeklyGroupCards.tsx`(frozen)는 **항상** `grid grid-cols-3`로 생산/출고/**현재**를 렌더(141–173줄)하고 상단 ±0/변동없음도 항상 표시(115–133줄). → 스샷1에서 현재·±0가 안 보이는 건 카드 로직 차이가 **아니라**, 카드가 뷰포트보다 넓어져(**가로 오버플로우**) 우측이 화면 밖으로 밀린 것. 즉 선택 공정에 따라 페이지 가로폭이 흔들림.
- **원인 가설(구현 시 라이브 확인 필요)**: 공정마다 바뀌는 유일한 콘텐츠는 "품목 상세"(`WeeklyDetailTable`). 모바일은 truncate 카드라(96–153줄, `min-w-0`+`truncate`) 자체론 안 넘쳐야 하나, 특정 품목 집합에서 가로 오버플로우가 새어 형제 섹션(공정별 변화)까지 넓히는 것으로 추정. 스크롤 컨테이너(`MobileWeeklyScreen.tsx` 99줄)가 `overflow-y-auto`만 있고 가로는 visible이라 자식 오버플로우가 페이지로 샘.
- 수정 방향(frozen 회피 — `MobileWeeklyScreen`만 수정): ① 스크롤 컨테이너(99줄)에 `overflow-x-hidden`(또는 각 section에 `overflow-hidden`+`min-w-0`) 부여해 자식 가로 오버플로우가 형제·페이지로 새지 않게 가둠. ② 품목 상세 섹션은 필요 시 `min-w-0 overflow-x-auto`로 자기 안에서만 스크롤. → 공정 바꿔도 공정별 변화 카드 폭은 항상 뷰포트에 고정.
- **구현 시 라이브 검증**: 주간보고 모바일에서 공정 전환하며 `document.documentElement.scrollWidth > clientWidth` 여부와 가장 넓은 요소를 특정해 정확한 오버플로우원 확정 후 가둠.
- ⚠️ **frozen 준수**: `WeeklyGroupCards`·`WeeklyDetailTable`·`WeeklyProductionMatrix`(전부 `_weekly_sections/`)는 **수정 금지** — import만. 오버플로우 차단은 `MobileWeeklyScreen` 래퍼에서만(4-13과 동일 원칙).
- 관련 파일: `frontend/app/mes/_components/mobile/screens/MobileWeeklyScreen.tsx`(99·128·143줄 래퍼만 수정), (참조·수정금지) `frontend/app/mes/_components/_weekly_sections/WeeklyGroupCards.tsx`·`WeeklyDetailTable.tsx`.
- PC 무변경: `MobileWeeklyScreen`은 모바일 전용 → PC 주간보고 무관.

---

## 6차 수집 (시작: 2026-06-23)

> **5차(5-1~5-8) 전부 구현·커밋·푸시 완료(2026-06-23, origin/main 반영, 6커밋 e856422e~627078ab).** tsc·ESLint·모바일/PC 라이브 검증 그린. 위 5차 체크박스는 이력으로 보존. 6차는 5차 구현 결과를 실기로 보며 추가로 모은 항목.
> 형식은 1~5차와 동일(화면·문제·코드 확인·수정 방향·관련 파일·PC/공유 무변경 주의). "구현해"라고 할 때까지 수집·정리만.
>
> **진행 상태 (2026-06-23): 6-1~6-6 전부 구현·검증·커밋·푸시 완료(origin/main 반영).** 플랜=`glistening-cooking-spark.md`(6차). 변경 6파일: `MobileWorkTypeStep.tsx`(6-1·6-4)·`IoConfirmStep.tsx`(6-2·6-3)·`IoBundleCard.tsx`(6-5)·`StickyFooter.tsx`·`IoTargetPicker.tsx`·`IoBundleCart.tsx`(6-6). tsc·ESLint·verify_local 그린. 모바일 라이브(dev 3001) 6건 전부 확인 + 데스크톱 PC 무변경 실측(IoConfirmStep 박스 lg:py-4=16px·메인 20px 복원, 푸터 footerBg=#07101d 일치, 저장 라벨만 "저장" 통일). **4커밋(41cc32c3·2a7a15f1·055aa89d·eab0bc09=origin/main) 푸시 완료. 직원 서버 배포는 사용자 지시 시 `/deploy-to-employee`.**

### 6-1. 입출고 Step2(세부 작업과 부서) — 버튼 크기 유지, 텍스트만 키우기
- [x] 화면: 입출고 Step2(세부 작업과 부서), 창고 입출고 흐름. 버튼 크기는 맘에 듦 → **텍스트만 더 크게**(버튼 min-h는 유지). ✅ 구현(세부작업 제목 text-xl·부제 text-sm, DeptGrid text-xl, min-h 유지)·라이브 확인.
- **코드 확인(`MobileWorkTypeStep.tsx`)**:
  - **세부 작업** 버튼(창고→부서/부서→창고): 버튼 `min-h-[64px] ... px-3 py-3`(253줄, 크기 유지 대상). 제목 `{row.label}` = `text-lg font-black`(260줄, 18px), 부제 `{row.description}`("BOM 1단계 하위 품목 자동 포함") = `text-xs font-semibold`(262줄, 12px).
  - **도착 부서** 그리드(튜브/고압…): `DeptGrid` 버튼 `min-h-[48px] ... text-lg font-black`(120줄, 18px). 크기(min-h-48) 유지, 글자만 키움.
- **요구(사용자)**: 버튼 크기 그대로, 글자 크기 ↑.
- 수정 방향(구현 시 실기 보며 확정): 세부 작업 제목 `text-lg`→`text-xl`~`text-2xl`, 부제 `text-xs`→`text-sm`. 도착 부서 `text-lg`→`text-xl`. `min-h`·padding은 건드리지 않음(버튼 크기 유지). 글자가 커져 2줄 넘치면 부제만 미세 조정.
- ⚠️ **공유 주의 — DeptGrid**: `DeptGrid`(95–134줄)는 **여러 곳 공유** — process 흐름 대상 부서(168줄), 창고 흐름 출발/도착 부서(275·290줄). 120줄 글자를 키우면 **모든 부서 그리드 버튼 글자가 같이 커짐**(부서 버튼끼리 일관되니 대체로 OK, 단 인지하고 실기 확인).
- ⚠️ 세부 작업 블록(245–270)은 **창고 흐름 전용**. process 흐름엔 비슷한 "입력 방식" 블록(209–224: 제목 `text-lg` 217줄·부제 `text-sm` 219줄)이 별도 → 일관성 위해 같이 키울지 구현 시 결정.
- 관련 파일: `frontend/app/mes/_components/mobile/warehouse/MobileWorkTypeStep.tsx`(120 DeptGrid · 260·262 세부작업 · 209~219 process 입력방식).
- PC 무변경: `MobileWorkTypeStep`은 모바일 전용(데스크톱은 `IoSubTypeStep` 별도) → PC 영향 0.

### 6-2. 입출고 Step4 ↔ Step5 저장 버튼 — 라벨 "저장"으로 통일 + 높이 통일
- [x] 화면: Step5 최종 확인 하단 "저장하기" vs Step4 "저장" — 라벨이 다름, 버튼 높이도 다르게 보임 → 통일(라벨은 "저장"으로). ✅ 구현(273줄 "저장하기"→"저장"). 모바일 높이는 실측 Step4=Step5=46px로 이미 동일. PC 높이는 원칙대로 현행 유지(Step5 lg:py-7=84px).
- **코드 확인**:
  - 라벨: Step4 = `저장`(`IoBundleCart.tsx` 156줄), Step5 = `저장하기`(`IoConfirmStep.tsx` 273줄, `{saving ? "저장 중..." : "저장하기"}`). → Step5를 "저장"으로 통일(로딩 문구도 함께 검토).
  - 높이(모바일): 둘 다 `flex ... border px-5 py-3 text-sm font-black`(IoBundleCart 152 · IoConfirmStep 265) → **모바일 코드상 높이 동일해야 함**. 다만 Step5는 `lg:px-6 lg:py-7 lg:text-base`(265)로 **데스크톱에선 큼**, Step4 저장(152)은 lg: 분기 없어 데스크톱도 py-3 → **PC에선 높이 불일치**.
- **요구(사용자, 모바일 화면 기준)**: 라벨 "저장" 통일 + 버튼 높이 통일.
- 수정 방향: ① 라벨 273줄 "저장하기"→"저장". ② 높이 — 모바일은 이미 동일(구현 시 라이브 재확인; 차이 보이면 스테일 빌드 가능성). PC 높이도 통일하려면 Step4 저장에 Step5와 같은 `lg:py-7`류를 주거나 Step5의 `lg:py-7`을 빼서 **양쪽을 한 기준(큰/작은)으로** 맞춤 — 구현 시 결정.
- ⚠️ 공유: `IoConfirmStep`·`IoBundleCart` 모두 PC 공유(4-9 주석). 라벨 변경은 PC에도 반영(무해). 높이 통일은 PC 레이아웃 영향 고려.
- 관련 파일: `frontend/app/mes/_components/_warehouse_v2/IoConfirmStep.tsx`(265·273줄), `frontend/app/mes/_components/_warehouse_v2/IoBundleCart.tsx`(152·156줄).

### 6-3. 입출고 Step5 — "창고 결재 요청" 요약 박스 크기 축소(너무 큼)
- [x] 화면: Step5 최종 확인 상단 요약 박스("창고 결재 요청 / 창고 → 부서 · 반영 N건 · 총 N / ⚠️ 창고 결재 필요"). 너무 커서 화면을 많이 차지 → 컴팩트하게. ✅ 구현(모바일 py-3·gap-2·text-lg·배지 px-3 py-1.5·아이콘 h-4, 전부 lg: 페어로 PC 복원). 실측 모바일 12px / PC 16px·20px.
- **코드 확인(`IoConfirmStep.tsx` 195–227)**: 박스 컨테이너 `flex flex-wrap items-center justify-between gap-4 rounded-[18px] border px-5 py-4`(196줄). 안에 ① 라벨 `mb-2 text-xs font-black uppercase`(203줄) ② 메인 줄 `text-xl font-black`(206줄, 20px) ③ 배지("창고 결재 필요") `inline-flex ... rounded-full px-4 py-2 text-sm font-black` + `AlertTriangle h-5 w-5`(211–216줄). → `py-4`·`text-xl`·배지 `px-4 py-2`·`gap-4`가 합쳐져 큼.
- **요구(사용자)**: 박스 크기 줄이기.
- 수정 방향(구현 시 값 확정): `py-4`→`py-3`, `gap-4`→`gap-2`~`gap-3`, 메인 `text-xl`→`text-lg`, 라벨 `mb-2`→`mb-1`, 배지 `px-4 py-2`→`px-3 py-1.5`·아이콘 `h-5 w-5`→`h-4 w-4` 중 적절히 골라 컴팩트하게. (정보는 유지, 여백·글자만 축소.)
- ⚠️ 공유: `IoConfirmStep`은 PC 공유(4-9). 박스(196줄)에 lg: 분기 없어 그대로 줄이면 **PC 요약 박스도 같이 작아짐** → 모바일만 줄이려면 lg: 페어(예 `py-3 lg:py-4`), 양쪽 다 줄여도 무방하면 공통 적용. 구현 시 PC 확인.
- 관련 파일: `frontend/app/mes/_components/_warehouse_v2/IoConfirmStep.tsx`(195–227줄).

### 6-4. 입출고 부서 입출고 Step2 — "입력 방식" 블록 제거(PC 정합)
- [x] 화면: 입출고 부서 입출고(process) Step2 — 대상 부서 / 방향(입고·출고) / **입력 방식(BOM 전개·단품 빠른 입력)**. 입력 방식은 PC엔 없는데 모바일에만 있음 → 제거해 PC와 통일. ✅ 구현(블록 제거 + 고아 정리: curDir const·deptIoSubType·isSingleInlineSubType import 제거). 라이브 확인: 대상부서+방향만, 입고 선택 시 진행 정상(subType 자동 BOM).
- **검증(PC 확인)**: 데스크톱 `IoWorkTypeStep.tsx` 100–122줄 process 분기 = **대상 부서 + 방향만**(주석 "(입고/출고) 카드 + 대상 부서 그리드만 노출. 4 chip 숨김"). 입력 방식 없음 → 사용자 말 맞음.
- **기능 안전 확인**: `useIoWorkState.ts` 36–40 `setDeptIoDirection(dir)`이 방향 선택 시 subType 자동 설정(`in`→`produce`, `out`→`disassemble` = 둘 다 BOM 전개). 즉 입력 방식 UI 없어도 subType은 BOM 기본값으로 정해짐(PC와 동일). **제거해도 안 깨짐.**
- **요구(사용자)**: 입력 방식 블록 제거(PC에 없으니).
- 수정 방향: `MobileWorkTypeStep.tsx` process 분기의 `{curDir != null && ( …입력 방식… )}` 블록(약 195–229줄) **제거**. 제거 후 모바일 process도 항상 BOM(=PC와 동일). 그 블록 전용으로 쓰던 `onSubTypeChange`·`deptIoSubType`·`isSingleInlineSubType`가 컴포넌트 내 고아되면 import/인자 정리.
- 영향: 모바일 부서 입출고에서 "단품 빠른 입력(adjust)" 단축이 사라짐 = PC와 동일해짐(단품 조정은 별도 경로). 사용자 의도와 일치.
- 관련 파일: `frontend/app/mes/_components/mobile/warehouse/MobileWorkTypeStep.tsx`(195–229 블록 + 고아 정리), (참조) `_warehouse_v2/IoWorkTypeStep.tsx` 100–122·`_warehouse_v2/useIoWorkState.ts` 36–40.
- PC 무변경: `MobileWorkTypeStep` 모바일 전용 → 제거는 모바일만, PC 영향 0.

### 6-5. 입출고 번들 카드 — "현재 재고 / 실행 후" 가운데 정렬(5-6/Task5와 동일, 번들에도)
- [x] 화면: 입출고 묶음(번들) 카드의 "현재 재고 / 실행 후"가 좌측 정렬. 자식 라인은 5-6(5차)에서 가운데로 했지만 **번들 카드는 아직 좌측** → 동일하게 가운데. ✅ 구현(266줄 self-start→self-center, 부모가 모바일 flex-col이라 가로 중앙 성립, lg:self-center 유지로 PC 무변경). 라이브 확인.
- **코드 확인**: `IoBundleCard.tsx` 265–296줄. 현재재고(267–280)·실행후(281–294) 두 블록(각 `text-center lg:text-right`, 4-7B에서 텍스트는 center)을 감싼 컨테이너(266줄) = `flex items-center gap-6 self-start lg:shrink-0 lg:self-center`. **모바일 `self-start`라 그룹이 좌측**(텍스트만 center, 그룹 위치는 좌). 데스크톱은 `lg:self-center`.
- **요구(사용자)**: 번들 카드도 현재재고/실행후 가운데.
- 수정 방향: 모바일 `self-start` → 가운데(예 `self-center`, 또는 부모 flex 방향에 따라 `w-full justify-center`). `lg:self-center`(데스크톱)는 유지. (5-6은 IoLineRow를 `lg:contents` 래퍼로 처리했으나, 번들은 이미 `flex` 컨테이너라 정렬 클래스만 바꾸면 됨 — 부모 flex 방향은 구현 시 확인.)
- 관련 파일: `frontend/app/mes/_components/_warehouse_v2/IoBundleCard.tsx`(266줄 컨테이너 정렬).
- ⚠️ 공유: `IoBundleCard`는 PC 공유 → `lg:self-center` 유지로 데스크톱 무변경, 모바일 정렬만 변경.

### 6-6. 입출고/불량 sticky 푸터 — 버튼 뒤에 페이지 배경 깔아 스크롤 비침 차단
- [x] 화면: Step4(저장/제출확인) 등 하단 sticky 버튼. 4-6/4-7C/4-4B/4-10A에서 푸터 배경을 제거(투명)한 뒤로, 스크롤하면 버튼 뒤로 스크롤 콘텐츠가 비쳐 보임 → 버튼 뒤에 **페이지 배경과 동일한 배경**을 깔아 가림(단 "띠"처럼 안 보이게 border/shadow 없이). ✅ 구현(StickyFooter flat→LEGACY_COLORS.bg, IoTargetPicker·IoBundleCart bg-[var(--c-bg)] lg:bg-transparent). 실측 Step3·Step4 footerBg=#07101d=페이지 bg 일치, PC는 lg:bg-transparent.
- **코드 확인 (배경 제거된 푸터 3종)**:
  - `StickyFooter.tsx`(불량 Step1/2 · io Step2): `flat=true`면 `background: "transparent"`(21줄) + border/shadow 없음 → 투명이라 비침.
  - `IoTargetPicker.tsx` 372(Step3): sticky 푸터 className에 bg 없음(4-6에서 제거).
  - `IoBundleCart.tsx` 126(Step4): sticky 푸터 className에 bg 없음(4-7C에서 제거).
- **요구(사용자)**: 버튼 뒤에 배경과 동일한 배경을 완전히 깔기.
- 수정 방향(페이지 bg = `LEGACY_COLORS.bg` / `var(--c-bg)` — 위저드 루트 bg와 동일):
  - `StickyFooter`: 21줄 `background: flat ? "transparent" : s1` → `flat ? LEGACY_COLORS.bg : s1`. flat일 때 border/shadow는 계속 없음 유지. → flat 호출처(불량·Step2) 전부 한 번에 해결.
  - `IoTargetPicker` 372 · `IoBundleCart` 126: 모바일 className에 `bg-[var(--c-bg)]` 추가 + `lg:bg-transparent`(PC 정적·투명 유지).
- 효과: 페이지 bg와 같은 색이라 평소엔 띠 없이 자연스럽고, 스크롤 콘텐츠는 버튼 뒤로 가려짐.
- ⚠️ 공유/PC: 세 곳 모두 PC는 lg:static/정적이라 `lg:bg-transparent`로 PC 무변경. `StickyFooter`는 모바일 primitive(PC 미사용).
- 관련 파일: `frontend/app/mes/_components/mobile/primitives/StickyFooter.tsx`(21줄), `frontend/app/mes/_components/_warehouse_v2/IoTargetPicker.tsx`(372줄), `frontend/app/mes/_components/_warehouse_v2/IoBundleCart.tsx`(126줄).

