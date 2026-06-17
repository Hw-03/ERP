# 모바일 화면 수정 투두리스트

> 사용자가 모바일 화면을 하나씩 보며 불러주는 수정 요청을 모으는 파일.
> "구현해"라고 할 때까지 구현하지 않고 수집·정리만 한다.
> 시작: 2026-06-17

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
