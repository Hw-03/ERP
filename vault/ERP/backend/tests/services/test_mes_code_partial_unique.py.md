# test_mes_code_partial_unique.py

## 이 파일은 뭐예요?
`items.mes_code`에 걸린 전역 unique 인덱스가 활성 품목은 물론 소프트삭제(deleted_at) 후에도 동일 코드 재등록을 차단하는지(코드 영구 점유) 검증하는 단위 테스트입니다.

## 언제 보나요?
- mes_code unique 인덱스 스키마를 변경할 때
- 소프트삭제된 품목의 코드 재사용 정책을 검토할 때

## 중요한 내용
- `test_active_duplicate_mes_code_blocked` — 동일 mes_code 두 번 등록 → IntegrityError
- `test_soft_deleted_still_blocks_recreate` — 소프트삭제 후에도 동일 코드 재등록 차단

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/models/📁_models]] — Item 모델, mes_code 필드 및 unique 인덱스 정의
