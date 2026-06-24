# safety_stock_preview.py

## 이 파일은 뭐예요?
DB를 수정하지 않고, R 계열 품목의 안전재고를 "완성 본체(AF) 200대분 = 1대당 사용 개수 × 200" 규칙으로 재계산한 결과를 인터랙티브 HTML 표로 출력하는 미리보기 스크립트다. 출력 파일은 `backend/scripts/safety_stock_preview.html`.

## 언제 보나요?
- 안전재고 적용 전 계산 결과를 담당자에게 보여주거나 검토할 때
- BOM 변경 후 각 R 자재의 K값(1대당 사용 수)이 어떻게 달라졌는지 확인할 때

## 중요한 내용
- `TARGET = 200`: 완성 본체 목표 대수
- `compute_rows(con)`: items + BOM 로드 → 규칙 적용 → 행 목록 반환. safety_stock_apply.py가 이 함수를 그대로 재사용해 preview와 apply의 계산값이 100% 일치함
- R 계열: `min_stock = max(K across all AF BOM) × 200`
- A/F 계열: `computed = None` (안전재고 미지정 대상)
- BOM에 연결되지 않은 R 자재는 K=1 → min_stock=200 기본값
- `_DEPTH_CAP = 20`: BOM 순환 방지 깊이 한도

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/scripts/safety_stock_apply.py]] — 이 파일의 compute_rows를 import해 실제 DB에 적용
