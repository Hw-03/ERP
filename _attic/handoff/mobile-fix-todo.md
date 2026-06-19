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
