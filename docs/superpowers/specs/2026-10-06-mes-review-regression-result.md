# DEXCOWIN MES 검토 결과 수정·회귀 검증

2026-10-06 실행. 기준 HEAD `e11a0c874a6029e59dd25d9d560dc277bbb14acf`에 이번 변경만 명시적으로 overlay한 격리 QA 환경을 사용했다. 원본 기대값 JSON, 기존 검수 환경, 원본 직원·개발 서버/DB는 보존했다. 구현 완료 당시에는 커밋·푸시하지 않았으며, 이후 사용자 요청으로 기능별 커밋·푸시를 진행했다.

## 구현과 효과

| 대상 | 변경 동작 | 코드·검증 근거 |
|---|---|---|
| 8.19-02 | 여러 글자 모델 기호를 등록 기호 단위로 유일하게 해석해 연결 품목을 집계한다. 모호한 기호·기존 연결 해석 변경은 명시적으로 거부한다. | [mes_code.py](../../../backend/app/utils/mes_code.py:86), 모델·품목 API 회귀 테스트. 독립 UI QF1 단독/공용 품목의 연결 수 2 확인. BOM 수 0 fixture만 UI 확인했으며 실제 BOM 연결 경계는 자동 테스트 범위다. |
| 8.19-06 | API model_slots로 편집 모델을 복원하고 플래그만 저장해도 실제 품목 코드를 유지한다. | [useAdminMasterItemsForm.ts](../../../frontend/app/mes/_components/_admin_hooks/useAdminMasterItemsForm.ts:85), Vitest와 실제 저장·재열기. |
| 8.19-13 | 모델 삭제 뒤 직원 목록을 다시 읽고 담당 모델 표시를 갱신한다. 늦은 이전 조회가 삭제된 배정을 복원하지 않도록 한다. | [useAdminModelsCommands.ts](../../../frontend/app/mes/_components/_admin_hooks/useAdminModelsCommands.ts:81), [useAdminBootstrap.ts](../../../frontend/app/mes/_components/_admin_hooks/useAdminBootstrap.ts:61). UI 삭제 후 다른 모델 1순위 보존. |
| 8.21-11 | 양수 초기 재고를 공통 작업과 위치별 RECEIVE로 기록한다. 이력 총량과 서명된 실제 작업자를 남기고 주간 입고에 포함한다. | [items.py](../../../backend/app/routers/items.py:336). 위치 혼합·0수량·공통 취소·F704/F705·주간 경계 자동 테스트, 실제 UI 입고12·생산0·현재12. |
| PC-DELTA-PF-03 취소 부분 | 준비 취소 뒤 시각·작업자·CANCELLED 이벤트로 증명된 정상 요청 취소를 정합성 검사와 복구가 인정한다. 증거 없는 상태는 임의로 재개하지 않는다. | [inventory_integrity.py](../../../backend/app/services/inventory_integrity.py:379), [inventory_integrity_repair.py](../../../backend/app/services/inventory_integrity_repair.py:61). 역순 취소·예약 복구·불완전 증거 자동 회귀. 실제 UI 전 단계와 취소 후 정합성 문제0·재고12·예약0 확인. |

모델 기호는 개별 1~5자 지원을 유지한다. 연결 결과가 저장 컬럼 길이를 넘으면 422, 빈 기호·구분자 포함 기호는 422, 자동 기호 소진은 400으로 처리한다. 기존 자료를 자동 백필하지 않는다. 주간보고 동결 파일은 수정하지 않았다.

## 자동 검증과 리뷰

- 백엔드 모델/품목, 출하 동작·정합성·복구, 재고 요청·공통 취소 관련 8개 pytest 파일: **128 통과**(최종 코드, 13.36초).
- F704 대장 관련 16 테스트 통과. 이후 변경은 초기 재고 시각·기호 저장 길이·자동 기호 소진이며 해당 테스트로 재검증했다.
- 관리자 Vitest 5파일 **55 통과**, 변경 관리자 파일 ESLint 통과. 이번 프론트 overlay만 포함한 소스 사본 TypeScript 검사 통과.
- QA 도우미 **18 테스트 통과**, skill-creator `quick_validate.py` 통과, 이번 변경 `git diff --check` 통과.
- 요구사항 리뷰 후 품질 리뷰를 진행했다. 주간 경계의 마이크로초 증가와 조합 기호 저장 길이 지적은 실패 재현 테스트를 추가해 수정했다. 최종 백엔드 재검토 Critical/Important 0.
- 전역 작업 트리의 TypeScript 검사는 다른 세션의 진행 중 출하 코드 때문에 실패했다. 이번 변경의 격리 사본 검사 결과와 구분한다.

## 실제 브라우저 근거와 재사용

- 독립 사용: [review-20261006-e 결과](../../../_attic/runtime/mes-browser-regression/review-20261006-e/results.md). 관리자 모델·품목·직원 흐름을 실제 입력·저장·재열기로 확인했다. 실행별 session.json에 코드 해시·DB·URL·KST·프로세스 소유권을 기록했다.
- 최종 재고·취소: [review-20261006-f 결과](../../../_attic/runtime/mes-browser-regression/review-20261006-f/results.md). 초기 재고 이력·주간보고 화면과 읽기 전용 API 근거를 분리해 남겼다.
- 반복 검증: [mes-browser-regression 스킬](../../../.agents/skills/mes-browser-regression/SKILL.md). HEAD+명시 overlay로 전용 소스·DB·CSV·로그를 만들고 원본 포트·경로 이탈·점유 포트를 거부한다. 소유 PID·생성 시각·명령을 확인해 종료하고 증거를 보존한다.
- QA E/F 세션 종료와 전용 포트 해제를 확인했다. 원본 보호 포트의 프로세스는 유지됐다. 사용자 원본 JSON SHA256은 `7185b1cb6a267d44432608458b0b3ea6f55752c27b3de7252ef7d0df4d1dcf57`이다.

## 남은 범위

후속 커밋 분할: `50e79fac` 모델 연결·편집 복원, `d8b020ac` 직원 배정 갱신, `0c7cbcd0` 출하 취소 정합성, `4cb3bd13` 초기 재고. 스킬·검증 결과·활성 TODO는 별도 QA 커밋으로 묶는다. 첫 커밋의 staged 백엔드 소스 사본에서 모델 관련 44 테스트가 추가로 통과했다. 원본 작업 파일을 바꾸지 않고 공유 파일의 모델/초기 재고 변경을 나눴다. 다른 세션의 모바일 출하·공통 화면·CONTEXT 변경은 포함하지 않는다.

- 지도 PC-DELTA-MAP-05와 기존 보류 의견은 그대로 유지한다. 남은 전수 감사·다운로드·실제 주간 마감 동시 경합을 이번 작업의 PASS로 바꾸지 않았다.
- PC-DELTA-PF-03 취소 결함 수정은 F705 출하 완료 당시 다운로드 전체 PASS가 아니다.
- 실제 브라우저에서 QF1 편집 상세의 코드 미리보기는 `QF1-TR-???? (저장 시 부여)`로 보인다. 목록/API의 실제 코드는 유지된다. 이 표시 차이는 결과 문서에 남겼으며 이번 모델 복원 수정의 저장 실패로 해석하지 않았다.
- 기존 loadData의 늦은 실패가 새 조회 성공 뒤 오류 알림을 낼 수 있다는 경미한 리뷰 의견은 남는다. 삭제된 직원 배정이 복원되는 데이터 경합은 회귀 테스트로 막았다.
