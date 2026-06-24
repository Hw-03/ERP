# build_bom_graph_html.py

## 이 파일은 뭐예요?
모델별 대표 PF 5개의 BOM 가계도를 D3 v7 기반 인터랙티브 그래프 HTML 한 개로 생성하는 읽기 전용 스크립트다. 서버 불필요, SELECT만 수행하며 출력 파일은 `backend/scripts/bom_family_graph.html`.

## 언제 보나요?
- BOM 구조를 시각적으로 검토하거나 외부에 공유할 때
- 공정 단계(stage_order)별 레이어 피라미드 구조가 맞는지 확인할 때

## 중요한 내용
- `D3_PATH = scripts/vendor/d3.v7.min.js` — 이 파일 없으면 실행 불가(오류 안내 메시지 출력)
- `model_pf_pins` 테이블에서 대표 PF를 가져옴 (capacity 화면과 동일 기준)
- `build_bom_cache(db)` — app.services.bom의 BOM 캐시 빌드 함수 재사용
- `MAX_DEPTH = 10`: BOM 탐색 최대 깊이
- 18단계 고정 레이어(PF→PA→PR→AF→…→TR), 빈 단계도 띠로 표시
- 노드 클릭 → 하위 또는 상위 하이라이트, 드래그·줌·팬 지원

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/bom.py]] — build_bom_cache 함수
- [[ERP/backend/scripts/inspect_bom_depth.py]] — BOM 깊이를 텍스트로 확인하는 보조 스크립트
