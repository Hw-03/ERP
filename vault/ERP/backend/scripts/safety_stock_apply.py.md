# safety_stock_apply.py

## 이 파일은 뭐예요?
safety_stock_preview.py의 `compute_rows` 계산을 그대로 재사용해 items.min_stock을 실제 DB에 쓰는 적용 스크립트다. R 계열은 K×200으로 설정, A/F 계열은 NULL(미지정)로 갱신한다.

## 언제 보나요?
- safety_stock_preview.html로 결과를 검토한 뒤 실제 DB에 반영할 때
- 안전재고 정책이 바뀌어 min_stock을 일괄 갱신해야 할 때

## 위험도
🔴 높음 — `--apply` 옵션 시 모든 품목의 min_stock을 일괄 UPDATE한다. 부족/정상 알림 기준값이 전면 변경된다.

## 중요한 내용
- 기본 실행은 dry-run: 변경될 행 수만 출력
- `--apply` 옵션: 실제 UPDATE 및 commit 수행
- `from safety_stock_preview import DB_PATH, compute_rows` — 미리보기와 계산 로직 공유
- min_stock은 재고 수량·BOM backflush에 영향 없이 "부족/정상" 표시 임계값으로만 쓰임

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/scripts/safety_stock_preview.py]] — 계산 로직 원천(compute_rows 정의)
