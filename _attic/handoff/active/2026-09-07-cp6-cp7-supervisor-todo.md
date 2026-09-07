# CP6·CP7 총괄 실행 TODO

> **추천 모델: GPT-5.6 Sol** — 최신 AGENTS.md의 모델 범위 안에서 재고 안전막과 통합 경계를 판단한다.
> **추천 추론 수준: 최대** — 인증·재고·migration 충돌의 잘못된 통합 비용이 높다.
> **울트라: 사용** — CP6 구현과 CP7 사전감사·독립 리뷰의 독립 구간을 병렬 배분한다.
> **실행 방식: 별도 작업 + 읽기 전용 하위 에이전트** — 제품 코드 편집자는 워크트리별 한 명으로 제한한다.

**GOAL:** 최신 main `d2b0dd29`을 품질 브랜치에 통합하고, 격리 워크트리에서 CP6과 CP7의 승인된 카드를 모두 구현·검증하여 품질 브랜치를 main 통합 직전의 검증된 완료 상태로 만든다.

## 현재 실행 기준

- 사용자 승인: CP6·CP7 전체 실행과 명시한 품질 브랜치 commit/push. 최초 계획 후 main 변경을 확인했고, 추가 승인으로 `d2b0dd2969883b2c8876c4375c99a456dcb6f21e`까지만 가져오며 main 미커밋 파일은 제외한다.
- 품질 worktree: `C:\ERP\.worktrees\full-code-quality-checkpoint-2`
- 품질 branch/base: `codex/full-code-quality-improvement`, `74085263c85096044d365cad339526ac452a2a26`
- 공통 기준: `78e8023f41ef59528d9d8c07498e7653f9bee247`
- 총괄 작업: `01a02250-1191-7883-aa55-5fc91f6ccd87`
- S0 구현 작업: `01a079d0-9157-7503-9377-817f636c14c4`
- 확정 `SYNC_BASE_SHA`: `731edc2df15c89753e60c12be95a65ef88e33bde`. 품질 본 branch는 CP6 통합까지 이 SHA에서 고정한다.
- CP6 구현 작업: `01a07b0c-4563-7c41-a8c7-5df5ad2e91e2`, `C:\ERP\.worktrees\full-code-quality-cp6`, branch `codex/full-code-quality-cp6`.
- CP7 구현 작업: `01a07c76-6395-7dc0-ba58-91c6fc4d3538`, `C:\ERP\.worktrees\full-code-quality-cp7`, branch `codex/full-code-quality-cp7`, 고정 `POST_CP6_SHA=7f232773b1eea204a251bc5ac001ef5b03319d3b`. 초기 HEAD·branch·linked worktree·clean을 확인했고 B1부터 착수했다. 품질 branch는 이 SHA에서 CP7 최종 통합까지 움직이지 않는다.
- 정본 감사 계획: [전수 감사·개선 계획](../../docs/research/2026-08-13-full-code-quality-audit-and-improvement-plan.md), 8.9.7·8.9.8 및 12.26절
- 현 상태(2026-09-08): **CP6 종료·품질 통합 완료. CP6 d60f84ed의 CI34135084227과 품질7f232773의 CI34137728037이 모두 실제6/6 success다. 품질 branch는 POST_CP6_SHA에서 고정하고 CP7 B1을 진행한다. 남은 단계는 새 diff만 focused 검증하며 최종 통합에서 전체 gate·실제 CI를 확인한다. 근거는 감사12.27.8~12.28이다.**
- 실행 단위 집계: 아래 8/16 완료, 미완료8. CP6 종료·통합까지 완료했으며 CP7 B1~B7 및 최종 통합은 아직 미완료다.

## 실행 체크리스트

- [x] S0 (2026-09-07): fixed main 병합, 전체 delta manifest, migration 두 계보 통합, 격리 보완, 영역별 검증 복구, 이중 리뷰, 제품 merge push 및 [실제 CI6/6 성공](https://github.com/Hw-03/ERP/actions/runs/34099290108). 제품 SHA `cd195d9e668cb4ece139f48562337f58d19839d8`; `SYNC_BASE_SHA`는 같은 제품 경로를 유지하는 본 docs-only commit이다. 문서-only CI 중복은 CP6 코드 push로 묶는다.
- [x] CP6 A1 (2026-09-07, LOCAL_VERIFIED): IC12→14 actual dirty/Promise save/이동 guard/React Query 단일 정본. 초기 RED와 후속 편집 유실을 보완해 관련14파일73PASS, 최종 명세/품질 C/I/M0. staged smart(frontend5/docs3) PASS, related41파일334PASS·direct10파일39PASS·타입/린트/docs PASS. 로컬 commit `59c52bad3f303603b01961b4e3ee3fb550bbd2e5`, post-commit clean을 총괄 확인. 원격 검증은 CP6 종료 단계다. 증거는 감사12.27.1과 `20260907-cp6-a1/`.
- [x] CP6 A2 (2026-09-07, LOCAL_VERIFIED): IC13→16 BOM/dirty/page/bulk·desktop/mobile load-more. 관련8파일239PASS, 품질 Important2 보완 후 delta frontend5/backend2PASS와 명세/품질 C/I/M0. smart exit1의 새 테스트 타입3종은 국소 수정해 typecheck exit0(417 known/new0), 직접182PASS로 복구했다. 실제 smart8PASS/1FAIL과 별도 docs3PASS(exit0)를 구분한다. 로컬 commit `adaa5bed1846bf071629d5d8cc37371cf7beca79`, 부모59c52bad·정확24경로·clean을 총괄 확인. full/CI는 CP6 종료 단계이며 감사12.27.2 및 `20260907-cp6-a2/`가 증거다.
- [x] CP6 A3 (2026-09-07, LOCAL_VERIFIED): IC15 focused4파일20PASS 및 Minor1 보완5PASS, 최종 명세/품질 C/I/M0. 최초 staged smart6PASS/1FAIL은 bundle만 실패했으며 coverage276파일2555PASS·build는 통과했다. 중복 상태 정리 후 focused6PASS/rebuild PASS, 승인 한도2.430MiB에서 실제2,537,378bytes·bundle2PASS/exit0, delta 품질C/I/M0. 미실행 docs3도 복구 완료(단위 총14건=13PASS/1권한skip). commit `8d7a0a77c28be3c35f80fdd75bace937ae897b18`, 부모adaa5bed·정확11경로·subject·clean을 총괄 확인했다. push0. 감사12.27.3과 ignored `20260907-cp6-a3/`가 증거이며 CP6 full/CI는 아직 남았다.
- [x] CP6 A4 (2026-09-07, LOCAL_VERIFIED): IC25 PA·PF KPI 모집단 상시 설명, 기존 계산 불변. 예상 RED2 뒤2파일8PASS, A5와 합친3파일34PASS·앱 tsc·변경6파일 ESLint exit0, 독립 명세/품질 C/I/M0다. 정확8경로 staged smart8/8PASS 후 commit `edc3a83611472ca6a99b134ac868e195d07ccd00`, 부모8d7a0a77·subject·clean을 총괄 확인했다. 감사12.27.4와 ignored `20260907-cp6-a4-a5/`가 근거이며 실제 desktop/mobile browser·push/CI는 최종 단계다.
- [x] CP6 A5 (2026-09-07, LOCAL_VERIFIED): IC26 첫/다른/같은 작성자 class 계약0/1/0, 탭·날짜·상세0을 RED1→26PASS로 확인했다. A4와 합친 명세/품질 C/I/M0·staged smart8/8PASS·commit edc3a836을 공유한다. 실제 animationstart/reduced-motion 증명은 최종 E2E에서 검증한다.
- 속도 우선 배치 조정(2026-09-07): A3 로컬 commit 뒤 A4 RED/GREEN → A5 RED/GREEN을 같은 단일 편집자가 순차 수행한다. 두 카드의 검증 근거는 분리하되 합친 diff의 독립 명세/품질 리뷰와 staged smart·로컬 commit은 각각 한 묶음으로 수행한다. 실제 browser animation/reduced-motion·KPI 표시는 CP6 최종 화면/E2E 검증에 포함한다. backend/DB/frozen 변경이나 최종 gate 생략은 없다.
- [x] CP6 종료·통합 (2026-09-08): SQL/API/UI·A4/A5/frozen·최종 두 리뷰C/I/M0·최종d60f84ed push와 CI34135084227 success를 확인했다. merge c9d70903의 tree는 exact이며 docs-only7f232773의 품질 CI34137728037도 실제6/6 success다. 총괄의 gh 원본 조회36d0dd와 ignored cp6-quality-ci-final.json이 근거다. 품질 branch는 고정하고 같은 통과 검사를 반복하지 않는다.
- CP6 최초 full 결과(2026-09-07): 693,611.448ms·exit1, 실제9PASS/1FAIL이다. frontend7영역은 전체276파일2,556테스트·coverage94.97%·build/bundle을 포함해 통과했다. PG는 깊은 Windows 임시 경로로 실패했다. backend full pytest/OpenAPI·docs·DB·E2E 등 미실행 영역과 실패 PG만 짧은 own basetemp에서 복구하며 frontend/full 전체는 반복하지 않는다. 최초 합성 DB hash불변·원래 부재 복원·소유 test DB 삭제/cluster 종료도 확인했다. 감사12.27.6과 ignored 최종 run `resume-4/`가 원본이다. 후속 구성 검사 통과를 최초 full 명령 PASS로 바꾸지 않는다.
- [x] CP7 병렬 사전감사 (2026-09-07): 타입·advisory·a11y·정책 consumer·문서·이동/중복 자산 manifest 및 DTO 후보26행 정적 검토, tracked 변경0. `full-code-quality-cp7-preaudit`의 ignored `20260907-cp7-preaudit/cp7-preaudit/preaudit.md`와 `ic21-manual-dto-targets.csv/.json`을 인계한다. 정적 차이18행은 실제 runtime 결함18건을 뜻하지 않는다. 제품/generator/runtime 검증은 CP7 구현 책임이다.
- [ ] CP7 B1 [로컬 구현·리뷰 완료, 원격 검증 전, 2026-09-08]: IC21 generated raw OpenAPI types + business adapter·nullable/unknown enum/serialization CI. 초기 명세·품질 지적을 보완해 최종 두 리뷰 C/I/M0·13파일162PASS·앱/테스트 타입·strict lint·build·bundle PASS를 총괄이 실제 근거로 인수했다. production preview/cancel 필수 구조 검증과 기존 stock/shipping pending key 보존은 서로 다른 계약이며 새 replay 프로토콜은 추가하지 않았다. 정확 staged/generated guard·미검증 구성 검사·commit/push·실제 CI 뒤에 완료 체크한다. 근거는 감사12.28.1~12.28.2다.
- [ ] CP7 B2: IC22 Next → Vitest/coverage → ESLint/PostCSS 세 독립 변경과 단계별 검증·rollback.
- [ ] CP7 B3: IC23 핵심 IO/shipping/defect/department 오류·focus·keyboard/axe blocking 계약.
- [ ] CP7 B4: IC24 확인된 두 번째 consumer 정책만 공통화; approval matrix·public facade 유지.
- [ ] CP7 B5: DOC01 live 링크·명령·DB·URL 정합성, 역사 관찰 재실행 금지.
- [ ] CP7 B6: AT01 source/target consumer 재검증, git mv와 모든 경로/문서 갱신, old path 0.
- [ ] CP7 B7: AT02 consumer 0 byte-identical frontend copy만 제거, 원본·item 이미지·실제 consumer 보존.
- [ ] CP7 종료·최종 통합: 상태/재고 matrix/manifest 재감사, full gate, 이중 리뷰, 품질 통합/push/CI, 임시 자원 정리, Goal 완료.

## 작업 분리와 진행 계약

S0가 GREEN이면 `SYNC_BASE_SHA`에서 CP6 제품 구현 작업을 만든다. CP7 사전감사는 사용자 속도 지시에 따라 이미 push한 잠정 제품 SHA `cd195d9e668cb4ece139f48562337f58d19839d8`에서 읽기 전용으로 먼저 시작한다. S0 최종 SHA와의 차이는 총괄이 확인하고 제품 변경이 있으면 그 영향 범위만 재조사한다. 이 선행 조사는 CI 성공이나 CP7 구현 완료를 뜻하지 않는다.

- CP6 구현: `C:\ERP\.worktrees\full-code-quality-cp6`, branch `codex/full-code-quality-cp6`.
- CP7 사전감사: `C:\ERP\.worktrees\full-code-quality-cp7-preaudit`, 조사 snapshot `cd195d9e`, 현재 detached `731edc2d`. 작업 `01a07af9-9e1b-7431-ac2e-68e6bf420894`. 조사 뒤 docs-only 차이2개를 확인해 기준만 맞췄으며 제품 재조사는 하지 않았다. ignored 증거만 작성했고 제품·문서·lockfile 변경, 설치·테스트·서버 시작은 없었다.

CP6 통합 뒤에만 `POST_CP6_SHA`에서 `C:\ERP\.worktrees\full-code-quality-cp7`, branch `codex/full-code-quality-cp7` 구현 작업을 만든다. CP7은 IC21→IC22 세 단계→IC23→IC24→DOC01→AT01→AT02→최종 재감사 순서다. 2026-09-08 속도 조정으로 검증된 CP6와 동일 제품 tree인 품질 통합의 CI 대기는 CP7 B1 로컬 구현·리뷰와 병행한다. 품질 CI는 실제 성공까지 추적하며 CP7 첫 commit/push는 그 뒤에만 허용한다. 사용자 재승인을 요청하거나 main에 반영하지 않는다.

S0 문서만 별도로 push하면 현재 workflow가 전체6job을 재실행하므로, 제품 merge CI 성공 뒤 문서2개는 로컬 docs commit으로 고정하고 CP6 코드 push와 묶는다. 이 docs tip을 `SYNC_BASE_SHA`로 쓰며 제품 경로는 CI 검증 merge와 exact여야 한다. 그 사이 품질 branch의 의도적 docs-only1commit ahead를 허용하고 CP6 통합까지 tip을 움직이지 않는다. 문서 전용 gate는 생략하지 않으며 최종 품질 branch의 upstream 일치 조건은 유지한다.

각 묶음은 RED→최소 구현→focused GREEN→새 변경분 명세·품질 리뷰→총괄 증거 확인으로 진행한다. 사용자 추가 지시에 따라 작은 저위험 묶음은 통합 검증·push·CI 확인을 함께 처리하며, 같은 코드의 통과한 전체 검증을 작은 수정마다 반복하지 않는다. 논리적 commit/rollback 단위는 유지한다. 전체 검증과 실제 CI 성공 확인은 S0·CP6·CP7 통합 경계에 유지하고 IC22의 호환성 검증은 세 단계별로 수행한다. 재고·권한·migration·서버 격리 문제는 즉시 검증한다. 총괄만 본 TODO와 정본 감사 문서를 갱신하며 사용자 재승인 없이 다음 GREEN 단계로 이동한다.

CP6의 A1~A5는 focused GREEN·독립 새 diff 리뷰 C/I0 후 구간별 local commit을 남긴다. 매 구간의 같은 full6CI push 대기는 반복하지 않고 CP6 최종 full gate·리뷰 후 한 번 push한다. 실제 CI 성공 뒤 품질 branch 통합/CI를 수행한다. 새 infra 또는 고위험 변경이 생기면 그 실제 영향만 별도로 판단한다.

사용자의 빠르고 신뢰도 높은 완료 지시에 따라, focused GREEN으로 고정한 같은 diff의 명세·품질 읽기 전용 리뷰는 병렬로 수행할 수 있다. 제품 편집자는 한 명이며 두 리뷰의 C/I0가 모두 필요하다. 수용은 명세 확인 후 품질 확인 순서로 하고, 리뷰 중 지적을 고치면 바뀐 관련 부분만 다시 검토한다. 필수 검토·완료 기준을 줄이는 것은 아니다.

CP7 검증 배치 조정(2026-09-08): B1은 응답 검증·멱등 key 안전막 변경이므로 최종 관련 검사와 실제 CI를 통과한 뒤 B2로 간다. B2의 Next → Vitest/coverage → ESLint/PostCSS는 순서·독립 로컬 commit/rollback 단위를 유지하되, 세 commit의 원격 push/전체 CI 대기는 B2 종료 시 한 번으로 묶는다. Next는 로그인·shell·proxy·빌드, Vitest는 실제 unit/coverage, ESLint/PostCSS는 lint·CSS/build 등 각 변경 도구가 책임지는 검사를 그때 실행한다. 앞 단계와 무관한 같은 검사를 다시 실행하지 않는다. 최신 diff의 명세·품질 C/I0, 생성 타입 guard 및 CP7 최종 full/실제 CI는 그대로 필수다. 최종 CI 실패 시 해당 변경 단위로 원인을 좁히며 기존 실패 기록을 PASS로 덮지 않는다.

## API·schema 경계

- S0는 기존 migration을 재작성하지 않고 `20260907_0034`, down_revision `("20260903_0032", "20260831_0033")`의 DDL 없는 merge revision만 추가한다. 이미 품질에 반영된 PostgreSQL repair도 보존한다.
- IC12는 프런트 저장 반환형 `Promise<SaveResult>`를 명시하고 기존 department API를 유지한다.
- IC16의 stable cursor/has_more는 additive이며 기존 list adapter를 한 release 유지한다. 재고 정책은 바꾸지 않는다.
- IC16 호환의 정확한 범위: legacy 배열 응답 형태는 유지하지만 active 목록은 최대50건으로 제한한다. 예전 무제한 전체 반환 의미까지 보존한다는 뜻은 아니다. 실제 desktop/mobile/shell consumer는 page 경로로 전환했고 legacy API/hook은 정의만 남긴다.
- IC21은 generated raw type과 업무 adapter를 분리하며 runtime wire format을 유지한다.
- 나머지 카드에서 breaking API/non-additive schema 변경을 임의 추가하지 않는다.

## 절대 보호 경계

- `C:\ERP` main tracked 파일/index/DB/서버는 변경하지 않는다. main 미커밋 파일을 읽거나 복사해 포함하지 않는다.
- `C:\ERP-dev` 파일·검색·해시·DB·프로세스·포트를 포함한 모든 접근을 금지한다.
- 실제 개발·직원 서버 시작/중지/배포, main merge/push, PR, force-push를 금지한다.
- DB mutation은 각 worktree ignored runtime의 격리 DB만 사용한다. 기존 `backend/mes.db`는 전후 불변이다.
- CP6 최종 read-only gate의 한정 예외: 현재 부재한 CP6 `backend/mes.db` 경로만, ignored runtime에서 생성·닫은 합성 schema-head fixture를 배타 생성해 임시 제공할 수 있다. 기존 파일이 발견되면 덮거나 사용하지 않는다. 실행 중 fixture hash 불변과 원래/최종 DB family 부재를 각각 증명하고, 소유권·hash가 같은 단일 임시 파일만 정리한다. 이는 실제 DB 무변경이지 파일 생성/삭제0은 아니다. main/직원 DB 복사·연결은 금지한다. 상세는 supervisor ignored `cp6-final-db-gate-prep.md`다.
- E2E base URL은 전용 loopback으로 고정하고 점유 포트에 mutation/종료를 보내지 않는다. 직접 생성한 PID와 시작시각을 검증한 프로세스만 종료한다.
- S0 실제 Windows 실행에서 bind-only probe가 점유된 8021을 가용으로 오판하고 identity404로 중단됐다. 다른 서버는 조회·종료·재사용하지 않는다. 격리 워크트리 자율 진행 승인에 따라 총괄이 connect+bind 점유 검사 보강과 전용 backend `8021 → 8022` fallback을 test-only 범위에서 승인했다. 선택 포트는 proxy/setup/nonce/cleanup 전체에서 일치해야 하며 두 포트가 모두 점유됐으면 mutation 전에 거부한다. 실제 개발·직원 포트 및 임의 URL을 허용하지 않는다.
- 주간보고·모바일 하단 nav/pill·출하 step5 카드 배치의 main 결과를 보존하며 추가 변경하지 않는다. 사용자 추가 승인 예외는 `frontend/app/mes/_components/_weekly_sections/__tests__/WeeklyDetailTable.test.tsx` 첫 render에 필수 `onItemSelect` 콜백 1줄을 보완하는 테스트 변경뿐이다.
- 고정 main 이후의 새 커밋은 이번 실행 도중 다시 동기화하지 않는다.
- 기존 pushed migration 수정, 추정 backfill, 동결 변경, 실제 PG/CI 증거 불가, 새 업무 정책, 범위 내 해결 불가 Critical/Important, 보존 불명 데이터 삭제는 자동 중단한다.

## 최종 S0 증거와 역사적 검증 기록

현재 S0의 정본 판정은 아래 최종 원격 검증과 `SYNC_BASE_SHA`다. 과거 실패·중단 당시의 `재실행해야 한다`, `pending`, `NOT_RUN`은 역사적 기록이며 새로운 CP6 할 일이나 S0 재검증 지시가 아니다. CP6는 변경된 부분의 focused 검사부터 진행한다.

- 최종 원격 검증: 총괄이 `gh run view 34099290108 --json status,conclusion,headSha,jobs`로 completed/success, SHA `cd195d9e`, Verification policy·실제PostgreSQL·Windows ops·Playwright·Backend·Frontend의6개 success를 확인했다. merge tree는 `aa12135fcb1051a51032d007e7b1e4a661aaaf43`, 부모는 품질74085263과 fixed main d2b0dd29다. docs-only commit 전 제품 dirty0, upstream divergence0/0이었다. 문서-only local commit1개 ahead는 위 속도 조정 계약으로 허용한다.

- 최신 E2E 복구: `20260907-cp6-cp7-supervisor/playwright-e2e-fallback-green.log`에서 17/17 PASS(2.4분), real mes.db 불변, cleanup-complete와 ownership released를 총괄이 읽었다. 후속 native exclusive port probe·HTTP readiness timeout 두 지적은 최소 수정으로 해결됐고 명세 재리뷰 C/I/M0이다. `e2e-infra-verification-contract-final2.log`는56/56, native lifecycle25/25, Windows wrapper6/6, `e2e-direct-npm-startup-smoke.log`는1/1 PASS다. 두 실제 실행 PID46472·44700은 사후 start token null이고 DB family SHA는 불변, 임시 DB/seed/lock/receipt는 absent다. 기존 점유8021/3100의 소유자를 조사하거나 종료하지 않았다. 제품 전체·PostgreSQL·coverage·build·17 E2E는 이 최소 수정 때문에 반복하지 않았다. 품질 리뷰 및 Git/CI 완료와 구분한다.

- 재개 후 복구 증거: test-only 명세·품질 리뷰 모두 Critical/Important/Minor 0, frontend 직접15파일272건과 backend 정확1건 PASS, npm 타입 계약 Node41/manifest277/known419·new0을 부모가 인수했다. 전체 frontend coverage271파일2522건 PASS(94.97%), production build 및 bundle2.408MB/한도2.414MB도 통과했다. OpenAPI exact, DB readonly mismatch0, docs 링크 및 docs 단위13 PASS/1 Windows symlink권한 skip이 확인됐다. full/staged 역사적 FAIL과 구분한다. 실제 E2E는 준비 단계 identity404이며 포트 점유 오판의 좁은 인프라 보완 후 다시 실행해야 한다.
- 최근 실패와 재개 승인: `staged-smart-final-timings.json`은 1,854.578초, exit1, 5 PASS·2 FAIL이다. backend 공통 E2E runner 정적 계약 1건과 frontend 신규 타입 진단 17그룹·24건이 실패 원인이며 뒤의 gate는 NOT_RUN이다. frontend 진단은 독립 읽기 전용 조사에서 테스트 fixture/mock drift로 분류됐다. fixed main의 `_weekly_sections/__tests__/WeeklyDetailTable.test.tsx:38-42` 첫 render에 필수 `onItemSelect` 콜백이 누락되어 예외 승인을 요청했고, 사용자가 격리 작업 범위 내 자율 진행을 명시 승인했다. 타입 baseline 상향·ts-ignore·제품 Props 완화로 우회하지 않는다. 동일 S0 작업에 최소 보완, 직접 실패 검사와 미실행 영역, 독립 리뷰를 지시했다. 기존 PASS인 PostgreSQL·전체 backend는 이 테스트-only 보완 때문에 반복하지 않으며 복구 결과를 full 명령 PASS로 표현하지 않는다.
- 일시정지 종료 증거: `PAUSED-FROZEN-WEEKLY-TYPECHECK-HANDOFF.md` 및 소유 PostgreSQL의 기존 종료 명령 원본을 부모가 확인했다. 소유 PID28076 cluster는 정상 종료됐고 `pg_ctl status`는 3(no server)이다. 중지한 cluster 파일은 ignored 경로에 남겨 두었으며 DB 데이터 삭제 완료로 주장하지 않는다. 기존 `mes.db` hash는 불변, 임시 E2E 산출물은 absent이고 소유 포트는 해제됐다. 재개 전에 commit/push는 수행하지 않았다.
- S0 premerge: `_attic/runtime/code-quality-improvement/20260907-120744-s0-main-sync/`. 27커밋·159경로, 품질 변경 교집합 48경로, 실제 merge conflict 22경로.
- S0 전 품질 DB SHA-256: `D0419DC051B881DA145B466AF99490570D18C47BCAAE990C57FFD4476FE28147`.
- 총괄 승인 계약/작업 ID/진행 JSON: `_attic/runtime/code-quality-improvement/20260907-cp6-cp7-supervisor/`.
- 중간 검증: backend focused 363건, merge migration 총 10건(SQLite 5 + 실제 PostgreSQL 5)의 GREEN 원본을 총괄이 확인했다. PostgreSQL 필수 runner의 원본 exit0과 skip0도 확인했다. 87은 등록 selector 수이며 매개변수화된 실제 실행 건수와 같다고 표현하지 않는다. 이것만으로 S0 완료를 선언하지 않는다.
- 최초 full 결과: `full-gate.log`와 `full-gate-timings.json` 원본을 총괄이 확인했다. 2,143.254초 후 exit 1이며 실행된 gate는 5 PASS·2 FAIL이다. backend Ruff/mypy/PostgreSQL concurrency와 frontend lint/app type은 PASS, backend full pytest는 4개 테스트 실패, frontend test-typecheck는 readiness 문자열 계약 1건 실패다. 뒤의 OpenAPI·frontend E2E type/coverage/build/bundle·docs·DB·Playwright는 아직 미실행이다. “frontend 7개 영역 완료”라는 초기 보고는 잘못됐으며 이 원본 집계를 정본으로 삼는다.
- 후속 focused GREEN: `backend-focused-after-full-gate.log` 61/61, `e2e-verification-contract-after-signal.log` Node 계약 40/40(fail/skip 0), E2E typecheck PASS의 원본을 총괄이 확인했다. Node 40건에는 기존 검증 계약이 포함되며 신규 E2E 40건을 뜻하지 않는다.
- E2E 소유권 후속 리뷰: stale receipt teardown, 동시 setup의 공유 자원 삭제 경합, child signal 전에 lock을 해제하는 3건을 test-only runner/config guard/captured teardown 및 RED/GREEN으로 보완했다. 독립 최종 재리뷰 Critical/Important 0이며 실제 E2E 실행을 재개했다. 이 좁은 리뷰는 S0 전체 명세·품질 리뷰를 대체하지 않는다.
- 실제 E2E 1차: `e2e-actual-after-ownership.log`에서 16/17 PASS, `io-history-labels` PC 컬럼 검사 1건 FAIL을 확인했다. 현행 `HistoryTable.tsx:74-82,442-459`와 실패 DOM 모두 6열 `품목코드`를 표시하지만 테스트만 `품목코드 · 수량`을 기대했다. 제품 UI는 바꾸지 않고 selector/헤더 기대 두 곳을 현행 계약에 맞췄다. 원본 screenshot/video/DOM은 `e2e-first-run-failure-artifacts/`에 보존하고 targeted 재검증 뒤 필수 staged 검증과 전체 E2E를 통합한다.
- E2E 종료 상태: 기존 `e2e-preflight-state.json`과 `e2e-postfailure-state.json`을 총괄이 대조했다. `mes.db/-wal/-shm` 존재와 SHA가 모두 동일하고 임시 E2E DB·receipt·hash·seed·lock은 absent, 전용 8021/3300 bind 가능이다. 기존 3100 점유는 조사/종료하지 않고 3300 fallback을 사용했으므로 전체 listener 0으로 표현하지 않는다. 최초 full FAIL은 별도로 보존하며 후속 focused PASS로 full PASS를 주장하지 않는다.
- 실행 경계 예외: S0 담당자가 진행 진단 중 전역 `Win32_Process` 조회 후 worktree/검증 명령 문자열 필터를 1회 수행했다고 보고했다. 뒤이어 소유 backend gate PID `56084`의 자식 관계를 1회 조회했다. 총괄은 전역 조회를 즉시 중단시키고 이후 소유 PID·원본 로그만 확인하도록 제한했다. 서버·DB·파일 변경 여부와 메타데이터 조회 범위를 별도로 기록하며, 이 사실을 무조건적인 “직원 환경 접근 0” 주장으로 덮지 않는다. 상세는 기존 증거만 사용하고 직원 환경을 다시 조회하지 않는다.
- 추가 실행 경계 기록: Node 위치를 찾는 동안 담당자가 `C:\Users\user`에서 파일명 metadata 재귀 검색을1회 수행했다. 총괄은 이를 중단하고 이미 검증한 quality runtime의 Node20 절대 경로를 후속 작업에 고정했다. 이 탐색을 worktree-only read0으로 숨기지 않으며 서버/DB 변경과 구분한다. 같은 검색이나 직원 환경 재조회는 하지 않는다.
- 기존 CP5 HEAD74085263 CI [33936388212](https://github.com/Hw-03/ERP/actions/runs/33936388212)는 6개 job 모두 success임을 2026-09-07 읽기 전용 재확인했다. 이는 신규 S0 검증을 대체하지 않는다.
- main required status checks API는 `404 Branch not protected`, effective rules 및 rulesets는 비어 있었다. 외부 강제 정책은 `NOT_VERIFIED`이며 설정을 변경하지 않는다. CP4/IC20 저장소 구현·CI 성공과 외부 정책 완료를 구분한다. 품질 브랜치 완료를 허용하되 main 통합은 별도 승인/재감사 대상이다.

이전 CP5 TODO의 정지·다음 단계 미승인 설명은 그 시점의 역사적 상태다. 현 실행에는 본 문서의 사용자 승인과 fixed SHA를 적용한다.

## CP6 최종 검증 준비 경계 기록

- 최신 판정(2026-09-07, 감사12.27.8): 최종 화면 최초18PASS/1FAIL/1NOT_RUN과 창고 보정2/2 복구, SQL/API/UI·A4/A5/frozen·합성 hash불변/원래부재 복원·소유 자원 정리·최종 두 리뷰C/I/M0를 인수했다. 원격 전체 CI와 품질 통합은 아직 미완료다. 아래 준비/실패 당시의 미확인 설명은 역사적 기록이며 이 최신 판정을 따른다.

- backend 구성 검사 복구에서 PostgreSQL129/129·exit0을 확인했으며 전체 backend pytest는6실패로 종료됐다. 원인별 국소 복구 중이며 CP6 종료 체크는 유지한다. 원본은 최종 run의 `component-recovery-backend-3/`, 상세는 감사12.27.7이다.
- 실제 DB 자동 접근 경계 위반: 기존 migration 테스트가 local DB 부재 시 Git 공통 디렉터리로 main DB를 찾아 임시 복사한 뒤 revision20260903_0032로 skip했다. source의 `_primary_database_path()`123-135행과 테스트256-267행, 실제 로그를 총괄이 대조했다. 사용자에게 공개했고 원본 추가 접근·같은 테스트 재실행을 차단했다. synthetic0010 fixture로 데이터 보존/FK 검증을 유지하도록 교정하며, 자기 pytest 디렉터리의 정확 복사본만 내용을 열지 않고 정리한다. 이 실행은 main DB 접근0이 아니며 현재 정리/교정 완료는 아직 미확인이다. 개발·직원 서버 시작/중지/배포는 계속 금지한다.
- 후속 복구 확인: 정확 임시 복사본1개 삭제·파일명 잔여0을 원본 명령/JSON으로 확인했다. synthetic0010-stamped drift fixture1PASS, runtime 직접 자식 guard9PASS, 출하 read-only manifest32PASS와 두 리뷰 C/I/M0·Ruff/parser/diff/OpenAPI PASS다. 감사12.27.7이 최신 판정이다. exact8 staged smart PlanOnly의 infra18게이트는 미실행이며, 사용자 속도 지시에 따라 기존 PASS·국소 복구를 보존하고 미실행 docs3/DB/E2E/git-status만 이어간다. 전체 원격 CI 성공은 필수로 유지하며 이 한정 배치를 smart18/18PASS로 기록하지 않는다.
- 최종 full 실행 전 PostgreSQL 준비가 `pg_ctl start` 출력 파이프를 자식 서버가 상속해 대기했다. 소유 cluster를 정상 종료했으며 이 시도에는 full gate 실행과 임시 canonical DB 생성이 없었다. 이후 준비만 복구하며 기존 통과 검사를 재실행하지 않는다.
- 복구 스크립트의 상대 `apply_patch`가 허용 worktree 밖 `C:\ERP\_attic\runtime\code-quality-improvement\20260907-cp6-final\run-20260907-213626-9c04d839892444e1b40d3a10489ff061\resume-final-full.ps1`을 잠시 생성했다. 해당 단일 자기 파일은 `exec-a7398c6b-ef23-483b-9eb0-ce59bae86975`에서 제거됐다. 이 기록은 main 보관 파일 생성·제거의 경계 예외이며 서버·DB 변경 증거와 구분한다. 추가 main 정리·검색은 하지 않는다. 이후 패치 헤더에는 격리 worktree의 절대 경로만 허용한다.
