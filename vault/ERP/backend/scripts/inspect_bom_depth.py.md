# inspect_bom_depth.py

## 이 파일은 뭐예요?
모델별 대표 PF의 BOM 트리를 BFS로 탐색해 깊이·리프 수·공정 단계(stage_order) 분포를 출력하는 읽기 전용 진단 스크립트다. 생산 가능 수량의 immediate vs maximum 차이가 왜 안 나는지 파악할 목적으로 만들어졌다.

## 언제 보나요?
- capacity 계산에서 immediate(NF 이상 재고 기준)와 maximum(리프 재고 기준) 값이 같게 나올 때 원인 추적 시
- BOM 트리의 깊이나 공정 단계 분포가 올바른지 확인할 때

## 중요한 내용
- `analyze_tree(cur, root_id, stage_by_code)`: BFS로 트리를 펼치며 각 자재의 stage / 재고 / 깊이 출력
- `immediate` 기준: `stage_order >= 60 (NF)` 재고만 인정
- `maximum` 기준: 맨 아래 leaf까지 모두 인정
- depth=1 자식 중 stage < 60인 품목 목록을 출력해 immediate 차단 지점을 표시함
- sqlite3 직접 접속(서버 불필요), DB: `backend/mes.db`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/production_capacity.py]] — immediate/maximum capacity 계산 로직
- [[ERP/backend/scripts/inspect_pf_models.py]] — 대표 PF 목록 확인용 보조 스크립트
