# 📁 scripts

## 이 폴더는 뭐예요?
백엔드 일회성 운영 스크립트 모음이다. 테스트 재고 리셋, 안전재고 계산·적용, 품목코드 정정, 미완료 배치/고아 예약 정리, BOM 시각화 HTML 생성 등 API 라우터가 아닌 수동 실행 도구들이 있다.

## 언제 여기를 보나요?
- 개발 DB를 초기화하거나 테스트 데이터를 정리할 때
- 안전재고 정책 변경 후 min_stock을 일괄 갱신할 때
- BOM 구조를 시각적으로 점검하거나 공유할 때
- 품목 코드 일관성에 문제가 생겼을 때

## 주요 파일
- `reset_test_stock.py` — 입출고 이력·재고 전체 리셋 후 랜덤 재고 채움
- `rebalance_test_stock.py` — reset 후 품절/정상/부족 분포 목표로 보정
- `clear_pending_batches.py` — 미완료 배치(draft/submitted/reserved) 일괄 삭제
- `clear_orphan_reservations.py` — 고아 예약(RESERVED/SUBMITTED stock_request) CANCELLED 처리
- `safety_stock_preview.py` — 안전재고 200대분 재계산 미리보기 HTML 생성 (DB 변경 없음)
- `safety_stock_apply.py` — 미리보기와 동일 계산으로 items.min_stock 실제 갱신
- `repair_item_codes.py` — mes_code 어긋남 품목 탐지 및 정정
- `inspect_pf_models.py` — 모델별 대표 PF 선정 결과 확인
- `inspect_bom_depth.py` — 대표 PF의 BOM 트리 깊이·공정 분포 진단
- `build_bom_graph_html.py` — BOM 가계도 인터랙티브 그래프 HTML 생성

## 관련 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/inventory.py]] — PROCESS_TYPE_TO_DEPT 매핑 (재고 스크립트가 공용)
- [[ERP/backend/app/services/sr_approval.py]] — cancel_open_stock_requests (리셋 시 고아 방지)
- [[ERP/backend/app/services/bom.py]] — build_bom_cache (그래프 스크립트가 재사용)
