> **추천 모델: GPT-6.1 Sol** — 반영 대기 UI와 서버의 본인 확인 결과·다중 위치 반영 계약을 함께 수정한다.
> **추천 추론 수준: High** — 타인 결과 반영 차단, 전체 롤백, 중복 전송과 영수증 복구를 함께 검증해야 한다.
> **실행 방식: 단독 작업** — 조회·선택·미리보기·반영·복구를 같은 계약으로 순차 연결한다.

# 본인 반영 대기와 부서·창고 일괄 재고 반영

> 2026-10-14 main 통합 기록: 이 문서는 원본 작업의 구현 이력이다. 최신 통합 상태·검증·외부 증거 위치는 [통합 계획](2026-10-14-stocktake-main-integration.md)과 활성 통합 인수인계를 따른다. 여기 기록한 과거 검증을 이번 통합의 통과 결과로 재사용하지 않는다.

**GOAL:** 로그인한 본인의 반영 대기를 품목 단위로 조회·전체 선택하고, 선택 품목의 부서·창고 확인 결과를 한 번의 재고 반영으로 함께 처리한다.

실행 시 `executing-plans`, `test-driven-development`, `efficient-verification`, `verification-before-completion`을 적용한다. 2026-10-08 구현과 직접 관련 자동 검증을 수행했다. 아래 체크는 구현 증거를 반영하며, 실제 QA 대기 카드·회차 전체 규모·PostgreSQL 잠금 검증은 미완료다.

## 확정 범위와 구현 전 코드 근거

이 절의 경로·줄 번호·동작은 구현 전 확인 기록이다. 현재 동작과 검증 결과는 문서 마지막 실행 결과를 따른다.

- 사용자는 ‘본인 결과만 조회·반영’을 선택했다. 관리자도 일반 반영 대기에서는 본인 결과만 처리한다. 관리자 전용 회차 종료·강제 해제의 기존 권한은 별도이며 이번 일반 반영 정책으로 대체하지 않는다.
- 현재 대상 라우터는 로그인 신원을 조회 서비스의 소유자 조건에 넘기지 않는다: `backend/app/routers/stocktakes.py:56`. 조회·반영이 이미 본인 전용인 상태는 아니다.
- 일반 반영 선택 검증은 소유자 검사 없이 같은 위치와 최대 확인 결과 수를 검사한다: `backend/app/services/stocktake_application.py:18`. 기존 단일 위치 API의 100개·400효과 제한은 호환 경로에 유지한다.
- 화면의 위치 선택과 선택 제한은 `frontend/app/mes/_components/stocktake/StocktakeView.tsx:185`, `:240`, `:306` 및 `StocktakeTargetList.tsx:97`에 연결되어 있다.
- 위치별 적용 증빙은 각각 고유 preview/operation을 요구한다: `backend/app/models/stocktake.py:120`. 여러 위치에 동일 preview를 재사용할 수 없다.
- 회차 종료에는 이미 여러 위치를 같은 트랜잭션에서 감소부터 적용하는 경로가 있다: `backend/app/services/stocktake_closing.py:197`. 일반 반영 UI에서 회차 종료 명령을 호출하지 않고 기존 적용 함수와 잠금 순서를 재사용한다.
- 실제 PC와 모바일 렌더 경로는 `DesktopMesShell.tsx:408`, `mobile/MobileShell.tsx:469` → `StocktakeView`이다. 하단 탭 디자인은 변경하지 않는다.

## 사용자 동작

1. ‘반영 대기 N’의 N은 현재 회차에서 본인의 유효한 `CONFIRMED` 결과가 하나 이상 남은 고유 품목 수다. 검색·필터와 무관한 메뉴 숫자이며 위치 수가 아니다. 미조회 상태를 0으로 표시하지 않는다.
2. 목록은 본인의 대기 결과가 있는 품목만 표시한다. 한 위치만 확인된 품목도 포함한다. 같은 품목은 한 행이며 기존 전체 위치 진행률을 유지한다.
3. 품목 체크박스를 선택하면 그 품목의 본인 확인 결과 중 아직 미반영인 부서·창고 위치를 모두 선택한다. 다른 작업자 결과, 초안, 이미 반영된 결과는 선택하지 않는다.
4. 목록 선택 컨트롤에 ‘전체 선택’ 체크박스를 추가한다. 현재 검색·부서·모델·공정 조건에 맞는 전체 본인 대기 품목을 대상으로 하며, 불러온 첫 페이지에 한정하지 않는다. 일부 선택은 indeterminate로 표시한다. 같은 컨트롤로 전체 해제한다.
5. 선택한 품목을 검토할 때 미리보기를 자동 조회한다. 검토 패널·모바일 시트의 큰 선택 요약, 위치 설명, ‘선택 반영 미리보기’, ‘선택 해제’ 버튼을 제거한다. 모바일 목록의 검토 진입 버튼과 패널 닫기 기능은 유지한다.
6. 검토에는 품목별 카드만 표시한다. 품목·확인자·확인 시각과 위치별 정상/불량/B급/구형의 현재·계수·차이·예약 표를 표시한다. 두 위치는 한 품목 카드 안에서 구분하고, 서로 다른 확인 시각도 각 위치에 표시한다.
7. 차이는 음수 red, 양수 기존 blue, 0 기존 기본색으로 통일한다. 끝의 실행 버튼은 ‘재고 반영’이다.
8. ‘재고 반영’ 한 번으로 선택한 전체 품목의 본인 대기 결과를 위치 구분 없이 함께 반영한다. 선택하지 않은 품목과 다른 작업자 결과에는 영향이 없다. 선택 전체 중 하나라도 검증을 통과하지 못하면 전체 미반영이다.

## Task 1. 본인 대기 조회·건수 계약 `[GPT-6.1 Sol] [순차]`

변경 파일:
- `backend/app/services/stocktake_reads.py`
- `backend/app/routers/stocktakes.py`
- `backend/tests/services/test_stocktake_dashboard_reads.py`
- `backend/tests/routers/test_stocktakes.py`
- `frontend/lib/api/types/stocktake.ts`

- [x] 수정 전 실패 테스트: 직원 A/B, 같은 품목의 서로 다른 위치, 한 위치만 확인, 이미 반영·재개·종료된 결과를 구성한다. A 목록과 전체 선택 자료에 B의 확인 ID가 없고 품목 수 중복이 없는지 검사한다.
- [x] 내부 조회 조건 `waiting_owner_id`를 추가한다. 외부에서 임의 직원 ID를 받지 않는다. 대기 전용 라우터가 검증된 `operator[0].employee_id`를 전달한다.
- [x] 유효 대기 조건은 아래와 같다. 최신 count, 현재 활성 회차, 확인 revision 및 기존 대상/위치 조건도 함께 검증한다.

```python
def is_owned_waiting(count: StocktakeCount, actor_id: uuid.UUID) -> bool:
    """A waiting observation belongs to the authenticated employee, not the caller's payload."""
    return (count.owner_id == actor_id and count.status == "CONFIRMED"
            and count.confirmation_revision_id is not None)
```

- [x] `GET /rounds/{round_id}/waiting-targets`에 기존 검색·부서·모델·공정·AND/OR를 적용한다. 소유자와 상태를 먼저 적용하고 고유 품목을 페이지 분할한다. 대기 판정에 `CONFIRMED_ALL`을 사용하지 않는다.
- [x] 동일 조건의 `GET /rounds/{round_id}/waiting-selection`은 페이지 제한 없이 모든 선택 가능한 본인 위치의 target/item/scope/confirmation revision과 표시용 메타 정보를 반환한다. 기존 계수 목록 조회와 필터 계산을 공유해 서로 다른 조건을 복제하지 않는다.
- [x] 진행 응답에 활성 회차의 `my_waiting: { items, locations }`를 추가한다. 품목 KPI·위치별 관리 집계·봉인된 회차 증빙은 변경하지 않는다. 종료 회차의 새 대기 값은 0이다.
- [x] 소유자·조회 버전을 커서 조건과 프런트 조회 키에 포함한다. 사용자·회차·필터 변경 이후 이전 응답이 새로운 선택에 들어가지 않도록 한다.
- [x] 직접 관련 서버 테스트를 통과시킨다.

## Task 2. 일반 반영의 소유자 강제 검사 `[GPT-6.1 Sol] [순차]`

변경 파일:
- `backend/app/services/stocktake_application.py`
- `backend/tests/services/test_stocktake_application.py`
- `backend/tests/routers/test_stocktakes.py`

- [x] 실패 테스트: A가 B의 확인 ID를 직접 보내는 미리보기, B의 preview를 사용하는 반영, 자기 것과 타인 것을 섞은 반영을 모두 거절한다.
- [x] 일반 단일 위치와 신규 일괄 반영 모두 preview 생성·반영 직전 count 소유자를 검사한다. preview의 actor와 요청 actor도 같아야 한다. 프런트 필터만으로 권한을 제한하지 않는다.
- [x] 회차 종료가 사용하는 공통 선택 검증에 소유자 제한을 무조건 넣지 않는다. 일반 반영 진입점에 정책을 적용해 기존 관리자 종료 계약을 보존한다.
- [x] 이미 완료된 동일 직원 영수증은 기존 결과를 그대로 재생한다. 기존 증빙·과거 성공 기록을 새 정책으로 수정하지 않는다. 미완료인 과거 preview는 현재 소유자 검증을 통과해야 한다.
- [x] 소유자·preview 작업자 검증과 기존 단일 위치 반영 테스트를 통과시킨다.

## Task 3. 다중 위치 일괄 반영 서버 `[GPT-6.1 Sol] [순차]`

생성 파일:
- `backend/app/services/stocktake_bulk_application.py`
- `backend/tests/services/test_stocktake_bulk_application.py`

변경 파일:
- `backend/app/schemas/stocktake.py`
- `backend/app/routers/stocktakes.py`
- `backend/app/services/stocktake.py`
- `backend/app/services/stocktake_application.py`

새 명령은 `application_bulk_preview`, `application_bulk_apply`다. 경로는 각각 `POST /rounds/{round_id}/application-bulk-previews`, `POST /rounds/{round_id}/bulk-applications`이다.

```json
{"confirmation_revision_ids": ["확인 revision UUID", "다른 위치의 확인 revision UUID"]}
```

반영 요청은 기존과 같은 seal 참조를 사용한다.

```json
{"preview_id": "일괄 preview UUID", "preview_hash": "SHA256"}
```

- [x] 실패 테스트: 두 위치·여러 부서를 함께 선택하는 성공, 두 번째 위치 적용 중 오류의 전체 롤백, 소유자 혼합 거절, 재계수·예약 변화·만료, 동일 키 재전송을 추가한다.
- [x] 신규 명령과 strict schema를 `COMMANDS`에 등록한다. bulk 선택은 기존 단일 위치의 100개/400효과 상한을 물려받지 않는다. 회차에 실제 편입된 전체 대상 수를 넘는 요청과 중복 ID를 먼저 거절하고, 모든 ID가 현재 본인 대기 결과인지 검증한다. 회차 범위·수량 정수 범위·예약 제한은 유지한다.
- [x] 공통 `selected_rows`에는 내부 `max_targets` 옵션을 추가하고 기존 기본값과 `max_scopes=1`을 유지한다. bulk만 서버가 조회한 해당 회차의 대상 수·위치 수를 상한으로 전달한다. `manifest`의 기존 효과 상한도 기본 유지하며 bulk 호출에서만 별도 전체 규모 검증으로 대체한다. 클라이언트가 검사 상한을 지정하지 않는다.
- [x] 선택 전체의 잠금을 한 번 선언한다. 기존 Item → Inventory → Gates 잠금 순서를 유지하고 범위를 나중에 확장하지 않는다. 읽기 SQL의 파라미터 제한 때문에 나누더라도 전체는 같은 트랜잭션을 유지한다.
- [x] master preview에 소유자·회차·대상 세대·선택한 모든 확인 revision·수량·예약·gate revision을 봉인한다. 위치별 child preview는 별도 seal로 만들어 기존 application의 preview 고유 제약을 지킨다.
- [x] 위치별 기존 manifest를 준비한 뒤, 같은 품목의 모든 선택 위치 증감을 합쳐 최종 총량을 검증한다. 위치 하나만의 임시 총량으로 잘못 거절하지 않는다. 예약 부족 등 보류 사유는 원래 위치별로 보존한다.
- [x] 반영 직전 master와 child 증빙·소유자·전체 revision을 재검증한다. 먼저 전체가 적용 가능한지 판정한 뒤 재고를 변경한다.
- [x] 전체 셀을 품목별 감소 우선 순서로 적용한다. 기존 `begin_application`, `apply_cell`, 관측 증빙·작업 원장·이벤트 함수를 재사용하고 위치별 고유 적용 ID를 영수증 ID와 scope로 결정한다.
- [x] 위치마다 commit하지 않는다. 모든 적용·관측·원장·상태·최종 영수증이 한 commit으로 성공하거나 함께 rollback한다. 성공 응답은 전체 위치별 application과 정확한 반영 revision 목록을 반환한다.
- [x] 기존 단일 위치 API, 회차 종료 크기 제한, 과거 preview·증빙 형식을 보존한다. DB 스키마 변경은 없다. 새 bulk 서비스가 기존 종료를 호출하거나 회차 상태를 변경하지 않는다.
- [ ] 전체 회차 선택 규모로 처리 시간·응답 크기·잠금 실패를 검사한다. 제한 시간을 넘기면 부분 성공으로 진행하지 않고 기존 결과 불명·영수증 확인 흐름으로 처리한다. PostgreSQL 잠금 검증을 실행할 환경이 없으면 해당 검증을 미완료로 기록한다.

## Task 4. 선택·검토 UI와 복구 연결 `[GPT-6.1 Sol] [순차]`

변경 파일:
- `frontend/app/mes/_components/stocktake/StocktakeView.tsx`
- `frontend/app/mes/_components/stocktake/StocktakeTargetList.tsx`
- `frontend/app/mes/_components/stocktake/StocktakeToolbarMenu.tsx`
- `frontend/lib/api/types/stocktake.ts`
- `frontend/lib/api/stocktake-command-journal.ts`
- `frontend/app/mes/_components/stocktake/StocktakeView.test.tsx`
- `frontend/lib/api/__tests__/stocktake-command-journal.test.ts`
- `frontend/lib/api/__tests__/stocktake-durable-journal.test.ts`

- [x] 실패 테스트: 대기 건수, 본인 부서+창고 동시 선택, 다음 페이지까지 전체 선택, 일부 해제, 필터 전환의 이전 응답 무시, 자동 preview, 제거 문구 부재, 음수 red, ‘재고 반영’ 호출을 추가한다.
- [x] 작업 메뉴에 선택적 `waitingCount`를 추가하고 기존 높이·간격 안에 품목 수를 표시한다. 숫자가 길어도 모바일 탭이 넘치지 않도록 한다. 최초 스켈레톤의 알 수 없는 건수와 오류를 0으로 위장하지 않는다.
- [x] `applicationScope`, 위치 선택 행, 같은 위치 제한, 선택 최대 100개 UI를 제거한다. 품목 체크박스는 그 품목의 본인 대기 위치 전체를 원자적으로 선택·해제한다.
- [x] 전체 선택 조회 중에는 선택 컨트롤을 잠근다. 회차·사용자·필터가 바뀌면 요청을 취소하고 늦은 응답을 무시한다. 검색·필터 변경 시 반영 선택과 preview는 초기화하되 조사 상세·계수 초안은 보존한다. 단순 더 불러오기는 선택을 유지한다.
- [x] 전체 선택은 클릭 시점의 확인 revision을 고정한다. 이후 생긴 대기 결과를 몰래 추가하지 않는다. 배경 갱신으로 선택 revision이 바뀌면 preview를 무효화하고 해당 품목의 재선택을 요구한다.
- [x] PC 검토 패널 또는 모바일 검토 진입 때 선택된 revision으로 자동 bulk preview를 요청한다. 선택 변경의 중간 상태마다 명령을 만들지 않고, 변경이 끝난 선택에 대해 중복 없이 한 번 요청한다. 늦게 도착한 이전 선택의 preview는 표시하지 않는다.
- [x] 큰 선택 요약·설명·미리보기/선택 해제 버튼·중복 품목 제목을 제거한다. 모바일 목록의 검토 진입 문구는 위치명 없이 ‘선택 N개 검토’로 표시한다. 품목별 카드 안에 위치별 표를 표시한다. 정상 상태에서는 품목 카드와 실행 버튼만 남기고 로딩·실패 재시도·보류 사유·결과 복구는 필요한 경우에만 표시한다.
- [x] 차이 스타일을 아래 규칙으로 통일한다.

```tsx
const deltaClass = delta < 0 ? "font-semibold text-[var(--c-red)]"
  : delta > 0 ? "font-semibold text-[var(--c-blue)]" : "";
```

- [x] 새 두 명령을 DTO·내구성 journal의 route 목록, View의 명령/결과 불명 타입과 완료·복구 처리에 등록한다. 기존 같은 작업자/같은 키 영수증 조회·재전송·명시적 미반영 확정이 새 명령에도 적용되는지 검사한다.
- [x] 요청 중에는 선택·추가 반영을 잠근다. `COMMAND_RESULT_UNKNOWN`이면 선택과 원래 키를 보존하고 새 키로 자동 재전송하지 않는다. 완료가 확인된 뒤에만 해당 선택을 정리하고 목록·KPI·대기 건수를 갱신한다.
- [x] `PREVIEW_STALE` 또는 명확한 미반영 오류는 선택을 보존한다. 새 preview를 다시 확인한 뒤 사용자가 반영한다. 백그라운드 갱신·인증 복구는 전체 화면 스켈레톤과 초안 초기화를 발생시키지 않는다.
- [x] 변경으로 실제 미사용이 된 props/import/helper와 이전 위치 선택 테스트만 정리한다. 기존 관리·종료·이력·취소·감사 코드는 보존한다.

## Task 5. 검증·QA·인수인계 `[GPT-6.1 Sol] [순차]`

- [x] 백엔드: 소유자 조건, 같은 품목의 다른 작업자 위치, 1/2 대기, 전체 선택과 필터·커서, 다중 위치 최종 총량, 중간 실패 전체 롤백, 예약 부족, 0차이 관측, 대규모 선택, 동일 키·결과 불명 복구를 검사한다.
- [x] 프런트: PC/모바일 대기 숫자·전체 선택·부분 선택·동적 필터·자동 preview·표 색상·버튼 이름·더 불러오기·배경 갱신·인증 복구를 검사한다. 열린 조사 상세와 저장되지 않은 계수 초안 보존도 기존 테스트로 회귀 확인한다.
- [x] 직접 관련 테스트 뒤 전체 TypeScript와 변경 파일 ESLint를 실행한다. 범위가 국소적이면 전체 빌드/전체 테스트 게이트를 반복하지 않는다.

```powershell
# 실제 worktree/backend에서 실행
& 'C:/Users/user/.codex/stocktake-sandboxes/2026-10-01-phase0/venv/Scripts/python.exe' -m pytest tests/services/test_stocktake_dashboard_reads.py tests/services/test_stocktake_application.py tests/services/test_stocktake_apply_contract.py tests/services/test_stocktake_application_evidence.py tests/services/test_stocktake_bulk_application.py tests/routers/test_stocktakes.py tests/services/test_stocktake_close_contract.py tests/services/test_stocktake_resolution.py -q --no-cov

# 실제 worktree/frontend에서 실행
& 'C:/ERP/_attic/runtime/tools/node-v20.20.2-win-x64/node.exe' node_modules/vitest/vitest.mjs run app/mes/_components/stocktake/StocktakeView.test.tsx app/mes/_components/stocktake/StocktakeLoadingSkeleton.test.tsx app/mes/_components/stocktake/StocktakeCommandRecovery.test.tsx lib/api/__tests__/stocktake-command-journal.test.ts lib/api/__tests__/stocktake-durable-journal.test.ts --maxWorkers=1 --minWorkers=1
& 'C:/ERP/_attic/runtime/tools/node-v20.20.2-win-x64/node.exe' node_modules/typescript/bin/tsc --noEmit
& 'C:/ERP/_attic/runtime/tools/node-v20.20.2-win-x64/node.exe' node_modules/eslint/bin/eslint.js app/mes/_components/stocktake/StocktakeView.tsx app/mes/_components/stocktake/StocktakeTargetList.tsx app/mes/_components/stocktake/StocktakeToolbarMenu.tsx app/mes/_components/stocktake/StocktakeView.test.tsx lib/api/types/stocktake.ts lib/api/stocktake-command-journal.ts lib/api/__tests__/stocktake-command-journal.test.ts lib/api/__tests__/stocktake-durable-journal.test.ts
```

- [ ] 390×844、575×884、640×884、1024×768、1440×900、1915×884의 라이트·다크에서 탭 건수, 필터 펼침/접힘, 긴 품목명, 다중 위치 표, 좁은 상세 패널과 스크롤을 확인한다. 임시 viewport는 복원한다.
- [ ] 기존 QA3147 복제본에는 제품 변경 파일만 동기화하고 SHA256을 확인한다. 사용자가 작성 중인 계수·회차를 초기화하거나 실행 중인 재고를 검증용으로 반영하지 않는다. 실제 일괄 적용·실패 주입은 격리된 테스트 DB로 검증하고 QA에서는 조회·선택·미리보기까지만 확인한다.
- [ ] 미리보기는 seal·영수증을 기록하지만 재고 수량·계수 상태는 바꾸지 않는다. QA 미리보기 검증 전에 이 영향을 설명하고, 사용자 작업·기존 DB를 보존한다. 서버 재시작이 필요하면 현재 QA 프로세스 소유권을 확인하고 해당 프로세스만 재시작한다.
- [x] 활성 인수인계 `_attic/handoff/active/2026-10-01-stocktake-todo.md`에 요청 7개와 일괄 반영의 완료 여부·테스트·화면·미실행 검증을 기록한다. 계획 시점에는 완료로 표시하지 않는다.
- [x] 현재 worktree·브랜치·누적 변경을 보존한다. 회차 전환·초기화·직접 DB 수정·커밋·푸시·배포는 포함하지 않는다.

## 완료 판정

- 메뉴 숫자·대기 목록·전체 선택이 동일한 본인 대기 기준을 사용한다.
- 페이지를 넘는 전체 선택에 부서·창고 결과가 포함되고 타인의 확인 결과는 포함되지 않는다.
- 검토 UI가 품목별 위치 표와 ‘재고 반영’ 중심이며 감소 값이 red다.
- 한 번의 실행이 선택 전체를 반영하거나 전부 미반영으로 끝난다. 실패·재시도·결과 불명에서 중복 재고 변경이 없다.
- 기존 품목 KPI 완료 규칙, 관리자 종료, 위치별 증빙, 모바일 이력과 계수 초안이 보존된다.

## 2026-10-08 실행 결과

- 구현: 본인 대기 조회·회차 전체 품목 건수·페이지 밖 전체 선택·품목별 다중 위치 검토·감소 빨강·재고 반영 버튼·소유자 강제 검사·원자적 일괄 반영·영수증 복구 연결을 적용했다. 기존 단일 위치 제한과 관리자 종료 계약은 유지한다.
- 백엔드 관련 132개 통과(실패·오류·skip 0). 소유자 혼합/타인 미리보기 거절, 내부 seal 단독 실행 차단, 예약 부족·재계수·만료·중간 실패 전체 롤백, 최종 총량·감소 우선, 중복 키·응답 유실·미반영 확정의 SQLite 동시 복구를 검사했다.
- 격리 DB에서 101품목·102위치·505효과의 전체 본인 대기를 선택·반영했다. 기존 단일 위치의 100개/400효과 상한 초과 검증이며 실제 QA 회차 전체 크기의 처리 시간·잠금 시험을 대신하지 않는다.
- 프런트 관련 고유 139개 통과. 최신 View 69개와 직접 관련 7개 파일의 기존 통과 결과를 결합했다. 전체 TypeScript·변경 9파일 ESLint·Python compileall·git diff --check 통과. 수정 전 실패한 영수증/늦은 선택 응답/권한 경계 테스트의 증거도 저장했다.
- 제품 프런트 7파일을 QA3147 사본에 동기화했고 SHA256 일치, 소유 기록이 일치하는 8147 백엔드의 readiness와 재시작 전후 모든 논리 테이블 동일을 확인했다. 종료·계수·확인·반영 명령은 QA에 보내지 않았다.
- QA 관리자 로그인에서 타인 대기 미노출·반영 대기 0·위치 선택 제거·빈 결과를 확인했다. 6개 지정 크기의 라이트/다크, 다크 필터 펼침/접힘에서 가로 overflow 없이 모바일 메뉴 54px·PC 58px를 확인했다. 테마와 임시 viewport는 복원했다.
- **미완료:** 대기 소유자인 김현우 계정의 QA 로그인 미확인으로 실제 대기 품목 선택·자동 미리보기·긴 품목명·다중 위치 표·좁은 검토 패널의 픽셀 확인은 수행하지 못했다. 계정 자격 증명은 추측·변경하지 않았다. PostgreSQL 환경이 없어 실제 잠금/교착 검증 및 QA 회차 전체 선택 규모 시험도 미실행이다.
- QA 업무 보존: 검증 후 재고·회차·계수·대상·증빙·거래 등 38개 업무 테이블 SHA256이 동기화 전과 같다. 로그인·테마 설정에 따른 employees/operator_sessions/activity_audit_logs/data_revision 변경은 별도이며 업무 데이터 미변경 증거와 구분한다.
- 증거: `_attic/runtime/stocktake-ui-20261008/owned-bulk/`의 verification.json·backend-complete.xml·frontend-complete.json·frontend-preservation.json·browser-matrix.json·admin-light-*.png·admin-dark-*.png·tables-before.json·tables-after.json·frontend-manifest.json·sync-result.json.
- 현재 브랜치 `codex/stocktake-20261001-phase0`, 누적 변경, 작성 중인 QA 회차를 보존했다. 원본 개발 DB 수정·회차 초기화·커밋·푸시·배포 없음.
