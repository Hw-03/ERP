# reasonCategories.ts

## 이 파일은 뭐예요?
불량 처리 사유 카테고리 상수를 정의하는 파일이다. 백엔드에는 자유 문자열로 전달되며, 프론트엔드 전체에서 공통으로 사용하는 선택지 목록이다.

## 언제 보나요?
- 사유 카테고리 목록을 변경하거나 추가할 때
- `ReasonFormFields`와 `DefectProcessPanel` 에서 임포트

## 중요한 내용
- `REASON_CATEGORIES`: `["외관 불량", "치수 불량", "기능 불량", "검사 통과", "기타"]` as const
- `ReasonCategory`: 위 배열의 유니온 타입

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/ReasonFormFields.tsx]] — 이 상수를 select 옵션으로 사용
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectProcessPanel.tsx]] — 직접 import해서 사용
