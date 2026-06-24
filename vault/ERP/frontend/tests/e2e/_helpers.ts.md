# _helpers.ts

## 이 파일은 뭐예요?
e2e 공용 헬퍼 모음입니다. 로그인 게이트 우회(`loginAsOperator`), 창고 작성 화면 진입(`gotoWarehouseCompose`), 작업 유형 카드 클릭(`pickWorkType`), 시드 데이터 읽기(`readSeed`) 4가지 유틸리티를 제공합니다.

## 언제 보나요?
- 새 e2e spec을 작성할 때 — 로그인·화면 진입 패턴을 공통화해서 가져다 쓰는 곳
- `loginAsOperator`가 실패하거나 잘못된 직원으로 로그인될 때 디버깅

## 중요한 내용
- `loginAsOperator(page, opts)` — `MesLoginGate` 3중 검증(localStorage·boot_id·활성직원) 을 런타임 API 조회로 통과. `opts.role`로 창고/부서 역할 직원 선택, `opts.code`로 특정 사번 직접 지정
- `OperatorLike` 인터페이스 — localStorage에 저장되는 직원 객체 스키마
- `gotoWarehouseCompose(page)` — `/mes?tab=warehouse` 진입 후 "작업 유형 선택" visible 요소 대기. 모바일·데스크톱 셸이 CSS로 분기되므로 `filter({visible:true})`로 중복 회피
- `pickWorkType(page, label)` — 작업 유형 카드 클릭 시 동일한 visible 필터 적용
- `readSeed()` — globalSetup이 저장한 `.e2e-seed.json`을 `require()`로 읽어 품목·직원 ID 반환

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/tests/e2e/global-setup.ts]] — `.e2e-seed.json` 생성 주체
- [[ERP/frontend/tests/e2e/io-receive.spec.ts]] — `loginAsOperator`, `gotoWarehouseCompose`, `pickWorkType` 실사용 예시
