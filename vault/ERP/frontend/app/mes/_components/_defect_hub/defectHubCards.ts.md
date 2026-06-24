# defectHubCards.ts

## 이 파일은 뭐예요?
불량 허브 진입 화면에 표시되는 카드 3장의 메타데이터를 정의하는 상수 파일이다. `DefectHubEntry`(데스크톱)와 `DefectHubPanel`(모바일) 양쪽에서 공유 임포트한다.

## 언제 보나요?
- 불량 허브 카드 목록·아이콘·설명 텍스트를 변경하거나 카드를 추가할 때

## 중요한 내용
- `DefectHubCardId`: `"quarantine" | "scrap" | "list"`
- `DefectHubCard` 인터페이스: `id, label, description, icon(LucideIcon), accentKey("red"|"blue")`
- `DEFECT_HUB_CARDS` 배열 3개:
  - `quarantine` — "불량 격리" (ShieldAlert, red)
  - `scrap` — "바로 폐기" (Trash2, red)
  - `list` — "격리 목록" (ListChecks, blue)
- `accentKey`는 문자열 키만 정의, 런타임에 `LEGACY_COLORS[accentKey]`로 resolve

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectHubEntry.tsx]] — 데스크톱 카드 렌더링
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectHubPanel.tsx]] — 모바일 카드 렌더링
