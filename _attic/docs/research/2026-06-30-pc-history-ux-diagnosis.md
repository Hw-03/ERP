# PC 입출고 내역 탭 UX 진단 보고서

> 작성일: 2026-06-30
> 대상: DEXCOWIN MES `입출고 내역` PC 화면
> 범위: `DesktopHistoryView`, `HistoryTable`, BOM/배치 전개, 우측 상세 패널, 필터/KPI/달력
> 제외: 모바일 화면, 코드 수정, 기능 구현 계획, DB 변경

## 결론

현재 `입출고 내역` 탭의 가장 큰 문제는 정보 부족이 아니다. 데이터는 충분히 표시되지만, 사용자가 현장에서 내역을 읽는 방식인 **"언제, 누가, 무엇을, 왜, 어디서 어디로, 몇 개, 결과가 어떻게 바뀌었는가"**의 문장으로 정리되지 않는다.

화면은 거래를 작업 단위로 묶어 설명하기보다 `구분`, `품목명`, `변동요약`, `요청자`, `메모` 같은 표 조각과 여러 색 배지로 나누어 보여준다. 그래서 사용자는 목록을 보는 순간마다 머릿속에서 "이게 단건인지, 생산 묶음인지, BOM 하위 차감인지, 출하와 동반된 자동 차감인지"를 다시 조립해야 한다.

특히 생산/BOM, 출하 동반 품목, 자동 차감, 재작업처럼 한 작업 안에 상위/하위 라인이 섞이는 케이스에서 문제가 커진다. 이 화면은 감사 로그로는 어느 정도 기능하지만, 현장 사용자가 내역을 빠르게 판단하는 화면으로는 정보 위계가 약하다.

## 확인한 실제 렌더 경로

- PC shell은 `DesktopMesShell`에서 active tab이 `history`일 때 `DesktopHistoryView`를 렌더한다.
  근거: `frontend/app/mes/_components/DesktopMesShell.tsx:15`, `frontend/app/mes/_components/DesktopMesShell.tsx:231`
- 사이드바의 PC 탭 라벨은 `입출고 내역 / 입출고 이력 조회`이다.
  근거: `frontend/app/mes/_components/DesktopSidebar.tsx:30`
- `DesktopHistoryView`는 상단 KPI, 필터, 달력, 목록 테이블, 우측 패널을 같은 화면에 배치한다.
  근거: `frontend/app/mes/_components/DesktopHistoryView.tsx:340`, `frontend/app/mes/_components/DesktopHistoryView.tsx:347`, `frontend/app/mes/_components/DesktopHistoryView.tsx:363`, `frontend/app/mes/_components/DesktopHistoryView.tsx:385`, `frontend/app/mes/_components/DesktopHistoryView.tsx:402`, `frontend/app/mes/_components/DesktopHistoryView.tsx:418`

## 진단 기준

PC 현장에서 사용자가 다음 질문에 3초 안에 답할 수 있는지 기준으로 봤다.

- 방금 처리한 거래가 맞는가?
- 어떤 품목이 어느 위치에서 어느 위치로 움직였는가?
- 수량은 얼마이고 처리 전/후 재고는 어떻게 바뀌었는가?
- 생산/BOM 작업에서 상위 완제품과 하위 차감품이 하나의 작업으로 읽히는가?
- 취소, 수정됨, 부족, 제외, 목록 외 같은 이상 신호가 즉시 보이는가?
- 요청자, 승인자, 메모, 참조번호를 바로 추적할 수 있는가?

## 가장 치명적인 UX 문제 Top 5

| 우선순위 | 문제 | 사용자 혼란 | 주요 원인 |
|---|---|---|---|
| 1 | 작업 단위가 아니라 로그 조각으로 보인다 | "이게 하나의 작업인가, 여러 거래가 우연히 묶인 건가?" | 배치 헤더가 `하위 N건`, `외 N건` 같은 데이터 묶음 표현을 사용 |
| 2 | 한 행이 업무 문장으로 읽히지 않는다 | "그래서 무엇이 어디서 어디로 몇 개 움직였지?" | 표 컬럼이 의미를 분산하고 재고 전후/위치/원인을 한 줄로 닫지 못함 |
| 3 | BOM/배치 전개가 원인-결과보다 계층 목록에 가깝다 | "상위 생산 때문에 하위가 빠진 건지, 그냥 자동 차감 로그인지 헷갈림" | `BOM`, `단품`, `자동차감` 배지가 같은 표 문법 안에 섞임 |
| 4 | 상세 패널도 판단 순서가 약하다 | "상세를 열었는데도 결론을 다시 읽어야 함" | 배지, 칩, 메타 카드가 쌓이지만 업무 결론이 맨 앞에서 문장화되지 않음 |
| 5 | KPI/필터/달력이 목록을 설명하지 못한다 | "지금 내가 보는 목록이 어떤 조건의 결과인지 불분명함" | KPI는 표시판, 필터는 옵션 카드, 달력은 별도 통계처럼 동작 |

## 목록 테이블 진단

### 증상

목록 컬럼은 `요청 일시`, `구분`, `품목명`, `변동요약`, `요청자`, `메모`로 구성된다. 우측 상세 패널이 열리면 일시/구분 폭이 줄고 품목명 폭이 늘어난다.

근거:
- `frontend/app/mes/_components/_history_sections/HistoryTable.tsx:37`
- `frontend/app/mes/_components/_history_sections/HistoryTable.tsx:47`
- `frontend/app/mes/_components/_history_sections/HistoryTable.tsx:227`

이 구조는 표로는 깔끔하지만 현장 판단 순서와 다르다. 사용자는 보통 "품목 + 행위 + 위치 + 수량 + 결과"를 먼저 확인하고, 그 다음 요청자/메모/시간을 본다. 현재는 시간이 맨 앞이고, 행위와 수량은 배지에, 위치와 재고 영향은 상세로 밀린다.

### 사용자 혼란

- `불량 처리`, `불량 해제`, `출고`, `생산`, `자동 차감`이 모두 비슷한 배지 형태로 보여서 상태와 행위의 차이가 약하다.
- `수정됨`은 품목명 셀 내부에 작게 붙어 이상 신호로 충분히 서지 못한다.
  근거: `frontend/app/mes/_components/_history_sections/HistoryLogRow.tsx:139`
- `메모`는 목록에서 내용이 아니라 작은 알약으로 표시되고, 전문은 hover title에 의존한다.
  근거: `frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx:186`
- 처리 전/후 재고, 위치별 영향, 참조번호는 목록만으로는 판단하기 어렵다.

### 원인 컴포넌트

- 단건 행: `HistoryLogRow`
  근거: `frontend/app/mes/_components/_history_sections/HistoryLogRow.tsx:58`
- 날짜 표시: `formatHistoryDate(log.requested_at ?? log.created_at)`
  근거: `frontend/app/mes/_components/_history_sections/HistoryLogRow.tsx:114`
- 구분 표시: `getHistoryDisplayLabel(log)`
  근거: `frontend/app/mes/_components/_history_sections/HistoryLogRow.tsx:123`
- 변동요약 표시: `MovementSummaryCell`
  근거: `frontend/app/mes/_components/_history_sections/HistoryLogRow.tsx:150`

### 개선 방향

목록 한 행은 표 조각보다 다음 업무 문장에 가까워야 한다.

```text
06/30 11:22 | 불량 처리 | 신주 케이스 작업완료 [SOLO]
진공 생산 -2 EA | 처리 전 400 -> 처리 후 398 | 요청 김현우 | 메모 있음
```

필요한 것은 컬럼 수를 늘리는 것이 아니라, 행 안의 정보 우선순위를 다시 잡는 것이다.

## 배치/BOM 전개 진단

### 증상

배치 헤더는 같은 `reference_no`나 `operation_batch_id` 그룹을 묶어 보여준다. 하지만 혼합 그룹은 `하위 N건 (혼합)`으로 표시되고, op batch는 `첫 품목 외 N건`으로 표시된다.

근거:
- `frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx:233`
- `frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx:303`
- `frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx:359`
- `frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx:361`

실제 PC 화면에서 혼합 배치를 펼치면 `출고`, `생산`, `자동 차감`이 같은 레벨의 로그 행으로 줄줄이 나온다. 이는 사용자가 "출하/포장 작업 하나"로 읽기보다 "서로 다른 로그 여러 개"로 읽게 만든다.

### 사용자 혼란

- `하위 N건 (혼합)`은 현장 작업명이 아니라 내부 데이터 그룹명처럼 들린다.
- 생산/BOM 묶음은 `상위 +N / 하위 -N`을 보여주지만, 왜 상위와 하위가 연결되는지는 문장으로 설명되지 않는다.
- 펼친 목록과 우측 상세의 깊이가 다르다. 목록 전개는 BOM 헤더까지만 보여주고, 실제 하위 차감 라인은 우측 패널에서 더 자세히 보인다. 사용자는 "목록에서 다 펼친 것인지" 헷갈릴 수 있다.
- 하위 라인에서는 `자동차감` 배지가 반복되지만, 이것이 "BOM 기준 소요품"인지 "독립 자동 차감 거래"인지 구분이 약하다.

### 원인 컴포넌트

- `BatchHeader`: `하위 N건 (혼합)` 표현
  근거: `frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx:236`, `frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx:303`
- `OpBatchHeader`: `외 N건` 표현
  근거: `frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx:326`, `frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx:359`
- `BomBatchDetail`: 부모 헤더 행의 일시 셀을 비우고 `BOM/단품` 배지를 표시
  근거: `frontend/app/mes/_components/_history_sections/BomBatchDetail.tsx:175`, `frontend/app/mes/_components/_history_sections/BomBatchDetail.tsx:189`
- `BomBatchDetail`: 하위 라인에 `자동차감` 배지와 상태 배지를 표시
  근거: `frontend/app/mes/_components/_history_sections/BomBatchDetail.tsx:252`, `frontend/app/mes/_components/_history_sections/BomBatchDetail.tsx:263`, `frontend/app/mes/_components/_history_sections/BomBatchDetail.tsx:265`

### 추가 디자인 리스크

BOM 하위 라인에서 BACKFLUSH 색상이 인라인 hex로 직접 들어간다. 색상 자체보다 더 큰 문제는 배지 톤이 여러 곳에서 비슷하게 반복되어 의미 차이가 약해지는 것이다.

근거:
- `frontend/app/mes/_components/_history_sections/BomBatchDetail.tsx:258`
- `frontend/app/mes/_components/_history_sections/BomBatchDetail.tsx:259`

### 개선 방향

BOM/배치 전개는 로그 목록이 아니라 작업 구조로 보여야 한다.

```text
생산 작업
완제품: SOLO 70KV ... +N EA
차감: BOM 부품 M종 -N EA
상태: 부족 없음 / 제외 없음
```

혼합 출하/포장도 다음처럼 작업명 중심으로 바꾸는 편이 낫다.

```text
출하/포장 작업
출고 N건 · 생산 N건 · 자동 차감 N건
대표 품목: DX-7020 ...
```

## 우측 상세 패널 진단

### 단건 상세

단건 상세는 품목명 아래에 `FlowBadge`, `MovementSummaryCell`, 처리 전/후, 메모, 재고 영향, 요청자/승인자를 순서대로 보여준다.

근거:
- `frontend/app/mes/_components/_history_sections/HistoryDetailPanel.tsx:153`
- `frontend/app/mes/_components/_history_sections/HistoryDetailPanel.tsx:240`
- `frontend/app/mes/_components/_history_sections/HistoryDetailPanel.tsx:267`
- `frontend/app/mes/_components/_history_sections/HistoryDetailPanel.tsx:350`
- `frontend/app/mes/_components/_history_sections/HistoryDetailPanel.tsx:365`
- `frontend/app/mes/_components/_history_sections/HistoryDetailPanel.tsx:483`

문제는 정보가 없는 것이 아니라 결론이 분산되어 있다는 점이다. 단건 상세에서 사용자가 먼저 알고 싶은 것은 "이 거래로 어느 재고가 몇 개 줄거나 늘었고, 처리 후 얼마가 되었는가"이다. 하지만 화면은 배지와 칩이 먼저 나오고, 위치별 재고 영향은 별도 카드에서 다시 읽어야 한다.

### 배치 상세

배치 상세는 `HistoryBatchHero`에서 작업 구분, 변동요약, 위치, 라인 수, 요청자/승인자, 배치 취소를 보여주고, 아래에 구성 라인을 표시한다.

근거:
- `frontend/app/mes/_components/_history_sections/HistoryBatchDetailPanel.tsx:150`
- `frontend/app/mes/_components/_history_sections/HistoryBatchDetailPanel.tsx:250`
- `frontend/app/mes/_components/_history_sections/HistoryBatchDetailPanel.tsx:300`
- `frontend/app/mes/_components/_history_sections/HistoryBatchDetailPanel.tsx:305`
- `frontend/app/mes/_components/_history_sections/HistoryBatchDetailPanel.tsx:342`
- `frontend/app/mes/_components/_history_sections/HistoryBatchDetailPanel.tsx:385`
- `frontend/app/mes/_components/_history_sections/HistoryBatchDetailPanel.tsx:433`

배치 상세의 핵심 문제는 `총 N묶음 / N라인 · 포함 N · 제외 N` 같은 구조 정보가 사용자의 첫 판단 언어가 아니라는 점이다. 이 정보는 필요하지만, 첫 번째 요약은 "어떤 작업으로 어떤 완성품/부품 재고가 어떻게 바뀌었는가"여야 한다.

### 기타 상세 문제

- `목록 외`는 현장 용어가 아니라 UI 내부 상태처럼 보인다.
  근거: `frontend/app/mes/_components/_history_sections/HistoryBatchDetailPanel.tsx:486`
- `HistoryDetailRecentLogs`는 파일로 존재하지만 현재 import 사용처가 없다. 같은 품목의 전후 맥락을 상세 안에서 제공하지 못하는 상태로 보인다.
  근거: `frontend/app/mes/_components/_history_sections/HistoryDetailRecentLogs.tsx:14`

### 개선 방향

우측 상세는 다음 순서가 더 적합하다.

```text
1. 결론: 이 작업의 결과
2. 재고 영향: 위치별 +/-와 처리 전/후
3. 구성: 상위/하위/BOM/자동 차감 라인
4. 책임: 요청자, 승인자, 시각, 메모, 참조번호
5. 액션: 취소/정정
```

## 필터/KPI/달력 진단

### KPI

상단 KPI는 현재 기간의 총건수와 창고/부서/수량조정 건수를 보여준다. 코드 주석상 3박스는 건수 표시판이다.

근거:
- `frontend/app/mes/_components/_history_sections/HistoryStatsBar.tsx:10`
- `frontend/app/mes/_components/_history_sections/HistoryStatsBar.tsx:24`
- `frontend/app/mes/_components/_history_sections/HistoryStatsBar.tsx:51`
- `frontend/app/mes/_components/_history_sections/HistoryStatsBar.tsx:58`
- `frontend/app/mes/_components/_history_sections/HistoryStatsBar.tsx:65`

문제는 숫자가 목록을 설명하기보다 장식적 KPI처럼 보인다는 점이다. 사용자는 이 카드를 누르면 필터링될 것처럼 기대할 수 있지만, 실제 기능은 별도 필터 패널에 있다.

### 필터

필터 바의 검색 placeholder는 검색 범위를 알려주지만, 길고 나열식이다.

근거:
- `frontend/app/mes/_components/_history_sections/HistoryFilterBar.tsx:50`

필터 패널은 `부서 구분`, `모델 구분`, `거래 종류` 3카드로 구성된다.

근거:
- `frontend/app/mes/_components/_history_sections/HistoryFilterPanel.tsx:53`
- `frontend/app/mes/_components/_history_sections/HistoryFilterPanel.tsx:68`
- `frontend/app/mes/_components/_history_sections/HistoryFilterPanel.tsx:82`

코드 주석상 KPI 박스와 필터는 동기되지 않는 표시 구조다.

근거:
- `frontend/app/mes/_components/_history_sections/HistoryFilterPanel.tsx:11`

문제는 현재 목록 조건을 한 문장으로 요약하지 않는다는 점이다.

```text
현재: 이번달 · 전체 부서 · 전체 모델 · 전체 거래 · 검색어 없음
```

이런 문장형 상태가 없어서, 상단의 숫자와 목록의 건수/날짜 범위를 사용자가 직접 맞춰 읽어야 한다.

### 달력

달력은 날짜별 거래 건수와 창고/부서/조정 카운트를 보여준다.

근거:
- `frontend/app/mes/_components/_history_sections/HistoryCalendarPanel.tsx:72`
- `frontend/app/mes/_components/_history_sections/HistoryCalendarPanel.tsx:73`
- `frontend/app/mes/_components/_history_sections/HistoryCalendarPanel.tsx:74`
- `frontend/app/mes/_components/_history_sections/HistoryCalendarStrip.tsx:213`
- `frontend/app/mes/_components/_history_sections/HistoryCalendarStrip.tsx:230`
- `frontend/app/mes/_components/_history_sections/HistoryCalendarStrip.tsx:255`

달력 자체는 유용하지만, 필터 패널과 동시에 펼쳐질 때 화면을 크게 밀어내고 목록과 분리된 통계판처럼 보인다. 날짜를 선택하면 목록이 좁혀지지만, 달력 숫자가 현재 검색/필터 조건과 같은 기준인지 즉시 설명하지 않는다.

## 색/배지/상태 표현 진단

현재 화면은 색 배지를 많이 사용한다.

- 거래 종류 배지
- 변동요약 배지
- 메모 배지
- BOM/단품 배지
- 자동차감 배지
- 수정됨 배지
- 부족/제외/목록 외 상태

각 배지는 개별적으로는 의미가 있지만, 모두 둥근 알약 형태라 정보의 계층이 약해진다. 사용자는 색을 통해 "좋음/나쁨/이동/자동/메모/상태"를 동시에 해석해야 한다.

`FlowBadge`와 `MovementSummaryCell`이 목록과 상세에서 반복 사용되며 배지 중심 문법을 강화한다.

근거:
- `frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx:39`
- `frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx:69`

개선 방향은 색을 줄이는 것이 아니라, 색의 역할을 분리하는 것이다.

- 거래 종류: 아이콘 + 짧은 텍스트
- 재고 증감: +/- 수량과 위치 중심
- 이상 상태: 독립 상태 영역
- 메모/참조: 보조 정보
- BOM 역할: 상위/하위 관계 구조

## 현장 시나리오별 평가

| 시나리오 | 현재 3초 판단 | 이유 |
|---|---|---|
| 방금 처리한 거래 확인 | 부분 가능 | 최신 행은 보이지만 처리 전/후와 위치 영향은 상세를 열어야 명확 |
| 특정 품목의 원인 추적 | 약함 | 같은 품목 최근 거래 컴포넌트가 현재 연결되지 않은 것으로 보임 |
| 생산/BOM 상위·하위 영향 확인 | 약함 | `상위/하위` 수량은 보이나 원인-결과 문장이 부족 |
| 취소/수정/부족/제외 확인 | 약함 | 이상 신호가 셀 안 배지 또는 상세 내부로 분산 |
| 요청자/승인자/메모/참조 확인 | 부분 가능 | 요청자는 목록에 보이지만 메모 내용과 참조번호는 상세 의존 |
| 출하 동반 자동 차감 확인 | 약함 | 혼합 배치 전개가 작업 단위보다 로그 나열로 읽힘 |

## 개선 후보 우선순위

### 즉시 개선

1. `하위 N건 (혼합)`을 업무명 중심으로 바꾼다.
   예: `출하/포장 작업`, `생산+BOM 작업`, `불량 처리 묶음`

2. 목록 행에 작업 단위 요약을 추가한다.
   예: `출고 N건 · 생산 N건 · 자동차감 N건`

3. 메모는 `메모` 배지만 말고 짧은 preview를 표시한다.
   예: `메모: 출하 동반 품목...`

4. `수정됨`, `취소됨`, `부족`, `제외`, `목록 외`는 상태 전용 자리로 분리한다.

5. 필터/KPI 아래에 현재 조건 요약 문장을 추가한다.
   예: `현재: 이번달 · 전체 부서 · 전체 모델 · 전체 거래`

### 구조 개선

1. 단건 로그 행과 배치/작업 묶음 행의 시각 문법을 분리한다.

2. BOM 전개를 표 하위행이 아니라 원인-결과 구조로 재설계한다.

   ```text
   완제품 입고
   - SOLO ... +N EA

   BOM 차감
   - 부품 A -N EA
   - 부품 B -N EA
   ```

3. 우측 상세의 첫 영역을 "결론 카드"로 바꾼다.
   배지 모음보다 `무슨 작업 / 어떤 결과 / 어디 재고 영향`을 먼저 보여준다.

4. 혼합 배치 상세는 로그 나열이 아니라 작업 흐름으로 묶는다.
   예: `제품 생산 -> 포장품 자동 차감 -> 출고`

5. 같은 품목 최근 거래를 상세 패널 안에서 실제로 연결할지 검토한다.

### 정책 확인 필요

1. KPI 카드를 클릭 가능한 빠른 필터로 만들지 여부
2. 내역 탭에서 취소/정정/수량 보정 액션을 어느 수준까지 노출할지
3. `목록 외` 같은 시스템 상태 표현을 현장 용어로 어떻게 바꿀지
4. BOM에서 `단품`, `BOM`, `자동차감`의 용어 체계를 통일할지

## 최종 판단

이 화면의 핵심 UX 부채는 "표가 못생겼다"가 아니다. **거래 단위와 작업 원인이 정보 위계의 맨 앞에 서지 못한다**는 점이다.

목록은 로그 테이블이고, 배치 전개는 데이터 계층이며, 상세는 카드 묶음이다. 세 영역이 각각 맞는 정보를 가지고 있지만 같은 거래를 같은 언어로 설명하지 않는다. 그래서 사용자는 내역을 확인할 때 계속 "이 줄이 무슨 작업을 의미하지?"를 해석해야 한다.

PC 화면을 현장에서 바로 쓰기 좋게 만들려면, 첫 개선은 시각 장식이 아니라 다음 문장을 화면이 직접 말하게 만드는 것이다.

```text
이 작업은 무엇인가?
무엇이 어디서 어디로 움직였는가?
상위/하위 재고 영향은 무엇인가?
이상 신호가 있는가?
누가 요청/승인했는가?
```

이 질문에 목록, BOM/배치 전개, 우측 상세가 같은 순서로 답하도록 맞추는 것이 다음 설계의 핵심이다.

## 구현 반영 메모

이번 worktree에서는 위 진단 중 "한눈에 읽히지 않는 목록/배치/상세 정보 위계"를 먼저 줄이는 방향으로 PC 화면을 조정했다.

- 목록 컬럼을 `일시 / 작업 / 대상 / 흐름 / 수량 · 재고 / 상태 · 처리` 기준으로 재정렬했다.
- 단건 행, `reference_no` 배치 행, `operation_batch_id` 배치 행이 같은 프레젠테이션 모델을 쓰도록 `historyPresentation.ts`를 추가했다.
- BOM/배치 전개에서 하위 라인의 역할, 자동 차감 여부, 수량, 상태가 같은 문법으로 보이도록 조정했다.
- PC 우측 상세 패널 상단에 판단 요약을 추가했다. 모바일 기본 상세 패널에는 기본 variant를 유지했다.
- 필터와 달력이 동시에 펼쳐져 목록을 과하게 밀어내지 않도록 한쪽을 열면 다른 쪽을 닫게 했다.
