> **추천 모델: GPT-6.1 Sol** — 기존 입출고의 프론트·백엔드 계약 확장.
> **추천 추론 수준: High** — 체크 의미 전환과 승인·반려·취소의 재고 정합성 검증.
> **실행 방식: 하위 에이전트 병렬 작업** — 백엔드와 화면을 분담하고 부모가 통합·검증.

# 사용출고 상위 차감·하위 반환

**GOAL:** 개발 서버에서 상위는 차감하고 체크한 하위만 반환하는 BOM 모드를 제공하며, 연결 승인 전체가 통과할 때만 재고를 반영한다.

사용자 승인: 기존 두 모드를 유지하며 `parent_with_returns`를 추가한다. 새 모드 진입 시
하위 체크를 모두 해제한다. 상위는 선택한 원본에서 차감, 체크 하위만 품목 소속 부서로
반환, 해제 하위는 수량 0·미반영으로 보존한다. 수량은 상위 × 직계 BOM 소요량이다.
BOM 재고 미반영 예외는 유지한다.

새 모드가 하나라도 포함된 IoBatch는 낱개·다른 모드 묶음까지 전체 승인 조건을 적용한다.
첫 반려 시 실제 반려 메타를 보존하고 나머지 요청·라인은 취소하며 전체 예약을 해제한다.
기존 승인자·시각은 보존하고 batch는 rejected로 닫는다. 기존 모드만 있는 배치는 기존
부분승인을 유지한다. 실행·원장·취소 엔진을 재사용하고 DB 마이그레이션은 없다.

- [x] 백엔드 — 새 모드 미리보기·입력 검증·초안·원자적 승인과 반려 정리 구현 및 관련 검사. 2026-10-15 완료.
- [x] 프론트 — PC·모바일 공용 버튼·체크 초기화·반환 위치·수량·최종 확인·초안·이력 및 관련 검사. 2026-10-15 완료.
- [x] 부모 통합 — OpenAPI 기준, 문서, 타입·정적 검사, 독립 검토 및 개발 화면 재현. 2026-10-15 완료.

실제 개발 데이터에서는 저장·제출하지 않는다. 승인·취소는 격리 테스트 DB에서 검증한다.
개발 3001의 기존 TOP/BOTTOM 각 1개와 HANDLE 20개 구성을 유지하고, 새 모드에서 고무·
내부 배터리·BAT BOTTOM·BRIDGE BD만 체크해 상위 -20/네 부품 +20/나머지 하위 미반영을 확인한다.
직원 서버·기존 업무 요청·브랜치·배포는 변경하지 않는다. 구현 중에는 커밋·푸시하지 않으며,
2026-10-15 후속 사용자 요청에 따라 이 기능과 안내 팝업 변경만 커밋·푸시한다.

## 검증 기록

- 백엔드 최종: `cd backend; python -m pytest tests/test_io_preview.py tests/test_io_v2.py tests/services/test_io_actions.py tests/test_transaction_cancel.py` — 319 passed, exit 0. 테스트 DB는 공용 fixture의 메모리 SQLite로 실제 업무 DB와 분리했다. 미리보기·API 미지원 및 반려 부분반영 실패를 RED로 확인한 뒤 구현했다.
- 프론트 최종: 저장소 전용 Node 20으로 관련 Vitest 10개 파일을 실행해 414 passed, exit 0. internalUseBom, IoBundleCard, IoLineRow.quantity, IoConfirmStep, useIoDraftRestore, IoComposeView.navigation, MobileIoComposeWizard.pullFromWarehouse, BomBatchDetail, HistoryDetailPanels, historyShared.golden을 포함했다. 모드 진입·반환 표시·이력 문구의 RED→GREEN을 확인했다.
- 전체 앱 `tsc --noEmit --incremental false`, 변경 TS/TSX 파일 ESLint `--max-warnings=0`, `git diff --check` 모두 exit 0. 전체 테스트·빌드·원격 CI를 실행한 것으로 주장하지 않는다. Vitest에는 기존 Browserslist 데이터 갱신 안내가 남았다.
- OpenAPI 기준 변경은 두 스키마의 모드 enum 확장뿐이다. 메모리 DB 환경의 `app.openapi()`와 기준 파일이 일치하고, 실제 8011 OpenAPI에도 새 모드가 등록됐음을 확인했다.
- 명세 준수 검토와 코드 품질 검토를 독립 에이전트로 순서대로 수행했다. 확정 중요 결함 없음. 예약 잔존 후보는 동일 원본이 승인 종류별 같은 요청으로 합쳐지는 실제 생성 경로를 확인해 철회했다.
- 실제 PC 브라우저: 개발 서버 문종현 계정에서 TOP/BOTTOM 각 1개와 HANDLE 20개를 담았다. 새 모드 진입의 전체 체크 해제, 네 부품 반환 선택, 같은 버튼 재클릭과 20→21→20 수량 변경 후 선택 유지, 최종 확인의 상위 -20·네 부품 각각 +20·나머지 하위 0/변동 없음·전체 승인 안내를 확인했다. 수량 조정 화면으로 돌아와 새 모드 상태를 남겼다. 모바일 동작은 공용 카드와 모바일 작성 흐름 자동 테스트로 확인한 범위이며 실제 모바일 브라우저 관찰로 표기하지 않는다.
- 실행 중 개발 백엔드가 이전 enum을 유지해 미리보기를 거절한 것을 관찰했다. 정식 stop/start 스크립트로 8011만 재기동한 뒤 ready 및 새 enum을 확인했다. 마이그레이션·bootstrap은 실행하지 않았다.
- 개발 업무 DB의 요청·작업 묶음·거래 기록 건수는 검증 전후 동일했다. 실제 저장·제출·승인·취소는 수행하지 않았다. 직원 환경은 별도 사용으로 작업 묶음 건수가 달라졌지만 이번 작업에서 직원 서버·코드·DB 쓰기는 실행하지 않았다.
- 증거: `_attic/runtime/internal-use-parent-returns/`의 `backend-final.log`, `frontend-final.log`, `before.json`, `final-check.json`, `development-mode.png`. 로그·이미지는 ignored 로컬 산출물이다. 최초 구현 검증 시점에는 변경을 main 작업 트리에 남겼으며 커밋·푸시·직원 배포는 하지 않았다.

## 안내 팝업 후속 변경 — 2026-10-15 완료

- 세 차감 방식 버튼을 누를 때마다 상위·체크한 하위·체크 해제한 하위의 차감·반환·변동 없음을 안내한다. 같은 버튼 재클릭에도 다시 표시하며 하위 선택은 유지한다. 수량 변경·초안 복원에는 자동 표시하지 않는다.
- 기존 공용 확인 팝업과 색상을 사용하고 작은 화면에서는 본문 스크롤을 허용한다. 반환 모드 전환 시 체크 초기화를 안내하며, 카드 아래 중복 안내 문구는 사용자 요청으로 제거했다.
- 관련 PC·모바일 흐름 3개 테스트 파일 75 passed. 버튼 재클릭 후속 변경은 공용 카드 테스트에서 RED를 확인한 뒤 22 passed로 검증했다. 타입 검사와 변경 파일 정적 검사도 통과했다.
- 실제 개발 화면에서 세 방식의 문구 및 같은 버튼 재클릭 시 재표시를 확인했다. 화면 크기 전환 검증 도중 기존 앱의 자동저장으로 생성된 미제출 초안 1건은 내용을 로컬 백업한 뒤 해당 건만 정리했다. 기존 요청·거래 기록은 변경하지 않았고 최종 작업 묶음 건수도 원복했다. 작은 화면 브라우저 검증은 완료로 표기하지 않는다.
- 후속 증거: 같은 로컬 산출물 폴더의 `popup-tests.log`, `popup-typecheck.log`, `popup-final-card-test.log`, `popup-reclick-red.log`, `mode-guide-popup.png`, `mode-guide-reclick.png`, `responsive-draft-backup.json`.
