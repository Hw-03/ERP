---
type: file-explanation
source_path: "frontend/app/legacy/_components/_history_sections/historyFormat.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# historyFormat.ts — historyFormat.ts 설명

## 이 파일은 무엇을 책임지나

`historyFormat.ts`는 입출고 내역 화면에서 날짜, 목록, 상세, 묶음 작업을 보여주는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `parseUtc`
- `formatHistoryDate`
- `formatHistoryDateTimeLong`
- `toDateKey`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopHistoryView.tsx]] — `DesktopHistoryView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/inventory/transactions.py]] — `transactions.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
/**
 * historyFormat.ts — 날짜/시간 파싱·포맷 순수 함수.
 * C2: historyShared.ts 에서 추출. 소비자는 historyShared 재export 또는 직접 import.
 */

/** UTC ISO 문자열 → Date. Z/오프셋 없는 문자열에는 Z 추가. */
export function parseUtc(iso: string): Date {
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
}

/** `MM/DD HH:mm` 형식 단축 날짜. 로컬 시간 기준. */
export function formatHistoryDate(iso: string): string {
  const d = parseUtc(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

/** 우측 상세 메타용 정본 형식 — `2026년 5월 14일    14시 21분` (초 제외). */
export function formatHistoryDateTimeLong(iso: string): string {
  const d = parseUtc(iso);
  const yyyy = d.getFullYear();
  const m = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}년 ${m}월 ${dd}일    ${hh}시 ${min}분`;
}

/** ISO → `YYYY-MM-DD` 키 문자열. 달력/그룹 인덱스용. */
export function toDateKey(iso: string): string {
  const d = parseUtc(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
```
