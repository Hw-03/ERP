# handoverPrint.ts

## 이 파일은 뭐예요?
인수인계서를 DEXCOWIN 실물 양식지 기준 A4 HTML 문서로 생성해 새 창에서 자동 인쇄(`window.print()`)하는 유틸 모듈.

## 언제 보나요?
- `HandoverSectionPanel`의 `HandoverCardList`에서 인쇄 버튼을 누를 때
- `printHandover(doc)` 함수를 직접 import해서 사용하는 곳

## 중요한 내용
- `printHandover(doc: Handover): Promise<void>` — 주요 export
- `@page { size: A4 portrait; margin: 13mm; }` — 헤더 40mm / 공정내용 13mm / 제품명+날짜 14mm / 작성자+인수자 14mm / 품목 26mm / 분석내용 104mm / 비고 60mm = 271mm 레이아웃
- `/dexcowin-logo.png`를 fetch해 base64로 변환 후 팝업에 삽입 (실패 시 로고 없이 진행)
- `esc()` — HTML 특수문자 이스케이프 (XSS 방지)
- 분석 내용은 20pt 볼드 (실물 양식과 동일)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_sections/HandoverSectionPanel.tsx]] — 이 함수를 `onPrint` 핸들러로 사용하는 패널
