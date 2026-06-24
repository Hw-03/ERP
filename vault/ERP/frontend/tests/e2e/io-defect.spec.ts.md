# io-defect.spec.ts

## 이 파일은 뭐예요?
불량 격리(새 격리)와 격리 해제(정상 복귀) 전체 흐름을 검증하는 e2e 스펙입니다. 창고 역할로 로그인해 `/mes?tab=defect` 불량 탭에서 E2E원자재튜브 5개를 외관 불량으로 격리한 뒤, 격리 목록에서 동일 항목을 정상 복귀시키고 목록이 비워지는지 확인합니다.

## 언제 보나요?
- 불량 허브 화면 구조나 격리/해제 플로우가 변경됐을 때 회귀 확인
- 모바일·데스크톱 셸 이중 렌더로 인한 `strict mode violation`이 발생할 때 (`filter({visible:true})` 패턴 참고)

## 중요한 내용
- 불량은 입출고 work type이 아닌 별도 최상위 탭(`/mes?tab=defect`)
- 격리·해제 모두 `approvalKind="none"` → 즉시 반영 (결재 없음)
- 이중 셸 회피: 모바일·데스크톱이 CSS(`lg:hidden`)로 둘 다 DOM에 있으므로 `filter({visible:true}).first()` 필수
- 정상 복귀 버튼: `"정상 복귀 →"` (화살표 포함) — "정상 복귀" 단독 선택자는 다른 요소와 충돌

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/tests/e2e/_helpers.ts]] — `loginAsOperator`
- [[ERP/frontend/tests/e2e/global-setup.ts]] — 시드 원자재(E2E원자재튜브) 생성 주체
