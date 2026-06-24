# inspect_pf_models.py

## 이 파일은 뭐예요?
items 테이블에서 PF 품목의 model_symbol 분포와 자연 정렬 기준 "자동 대표 PF" 선정 결과를 터미널에 출력하는 읽기 전용 진단 스크립트다.

## 언제 보나요?
- capacity 화면에서 모델별 대표 PF가 어떤 품목으로 잡혔는지 확인할 때
- model_symbol이 NULL이거나 분포가 이상한 PF가 있는지 점검할 때

## 중요한 내용
- 출력 1: `PF model_symbol 분포` — 심볼별 PF 개수
- 출력 2: `PF 샘플 40건` — (model_symbol, mes_code, item_name) 발췌
- 출력 3: `모델별 자연 정렬 첫 PF` — capacity 화면과 동일한 자동 대표 PF 선정 방식
- sqlite3 직접 접속(서버 불필요), DB: `backend/mes.db`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/scripts/inspect_bom_depth.py]] — 대표 PF의 BOM 트리 깊이 분석
- [[ERP/backend/app/services/production_capacity.py]] — representative_items 선정 로직 실제 위치
