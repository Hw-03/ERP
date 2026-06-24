# repair_item_codes.py

## 이 파일은 뭐예요?
items 테이블에서 mes_code가 (model_symbol, process_type_code, serial_no)와 어긋난 품목을 찾아 일괄 정정하는 스크립트다. 카테고리 어긋남(mes_code의 공정 코드 ≠ process_type_code)과 모델 어긋남(prefix 불일치) 두 종류를 처리한다.

## 언제 보나요?
- 품목 대량 임포트 후 mes_code 일관성 점검이 필요할 때
- process_type_code를 변경한 품목이 여러 건 발생해 코드 재정렬이 필요할 때

## 위험도
🔴 높음 — items 테이블의 mes_code와 serial_no를 직접 수정하며, `--apply` 시 자동 DB 백업 후 진행하지만 다수 품목 코드가 한꺼번에 바뀐다.

## 중요한 내용
- 기본 실행은 dry-run (변경 후보 출력만)
- `--apply` 옵션 시 `backend/_backup/mes_pre_repair_codes_<stamp>.db`로 먼저 백업
- 카테고리 변경: 새 카테고리에서 `next_serial_no`로 번호 재부여
- 모델 변경: serial은 유지, prefix(모델 번호)만 교체
- `CODE_PATTERN = r"^(?P<prefix>[0-9]+)-(?P<pt>[A-Z]{2})-(?P<serial>\d{4})$"` — mes_code 파싱 정규식

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/utils/mes_code.py]] — make_mes_code, next_serial_no 유틸
- [[ERP/backend/app/models/📁_models]] — Item 모델
