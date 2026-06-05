# 코드베이스 아키텍처 개선 — 자율 실행 결과 (2026-05-29)

플랜: `C:\Users\user\.claude\plans\improve-codebase-architecture-generic-lightning.md`
브랜치: `improve-codebase-architecture-20260529`
실행 모드: 자율 (사용자 부재 중 안전한 항목 처리)

## 완료 (8 커밋)

| 커밋 | 항목 | 영향 |
|---|---|---|
| `17a09d06` | P1-3 `_attic`/`_backup` 정책 문서 | `docs/ATTIC_POLICY.md` 신설 (실행 X) |
| `8814bf68` | P1-1 핵심 문서 복귀 + README/ONBOARDING 정합 | ARCHITECTURE/ERD/GLOSSARY/ITEM_CODE_RULES 복귀, ONBOARDING `_TODO_` 마감 |
| `d3ec7e3a` | P1-6 OpenAPI baseline 경로 정합 | README → `_dev/baselines/openapi.json` |
| `2d67cce0` | **P0-1 용어 사전 단일화** | `frontend/lib/io/glossary.ts` 신설, 4개 파일 어댑팅, 라벨 drift 정리 |
| `7b4c9a06` | P0-2 Ship 정책 문서화 | GLOSSARY 의 트랜잭션 라벨 변경 반영 + 출하 규칙 |
| `1ef4b7c2` | P1-2 ADR / CONTEXT.md | `docs/adr/` + ADR-0001~0004 + CONTEXT.md |
| `61b0c5b1` | P3-1 IoDraftWorkCard 접근성 | nested role=button 제거, 명시적 토글 |
| `1ccdb2ae` | P2-1 Playwright E2E 스캐폴딩 | config + 6 시나리오 (1개 활성, 5개 fixme) |

## 검증 결과

`verify_local.ps1` 전체 통과:
- frontend: tsc / lint:strict / vitest 638/638 / next build / bundle size 1.29MB
- backend: pytest 302/302
- OpenAPI drift: baseline 일치
- 결론: `All local verification checks passed`

## 사용자 결정 대기 (의도적 보류)

플랜에 명시한 다음 항목은 **사용자 결정이 필요해 본 자율 실행에서 의도적으로 보류**.

| 항목 | 보류 이유 | 결정 필요 사항 |
|---|---|---|
| **P0-3 서버측 identity/권한 검증** | 인증 방식 결정 필요 (PIN 확장 vs 세션 토큰 vs JWT) — 큰 아키텍처 결정 | 폐쇄망 LAN 운영이면 PIN 확장이 가벼움 |
| **P1-4 `services/io.py` god-service 분리** | 1,150줄을 6개 파일로. PR 순서·테스트 안전망 결정 필요 | preview·draft·logging 먼저 떼고 submit 마지막 권장 |
| **P1-5 Decimal/UTC 직렬화 정상화** | Decimal 정밀도 결정 필요 (소수점 자릿수 상한) | 6자리 이하면 float 안전, 그 이상이면 string 유지 |
| **P2-2 백엔드 auth boundary negative test** | P0-3 인증 도입 후에만 의미 있음 | P0-3 결정 후 |
| **P3-2 `IoComposeView` 책임 분리** | 970줄 → 점진 분리. 회귀 위험 큼. P2-1 E2E 안전망이 활성화된 뒤 시작이 안전 | E2E 시드 전략 결정 후 |

## 알아두실 변경 (사용자 확인 권장)

### 라벨 단일화 (P0-1) — 화면 표시 변경

같은 동작이 화면 여러 곳에서 다른 단어로 보이던 drift 를 통일했습니다. 사용자에게
즉시 보이는 변경:

| 코드 | 이전 | 변경 후 |
|---|---|---|
| `DISASSEMBLE` (history 단건) | "재작업" | **"분해"** |
| `MARK_DEFECTIVE` (history) | "새 격리" | **"새 불량"** |
| `UNMARK_DEFECTIVE` (history) | "격리 해제" | **"불량 해제"** |
| `DEFECT_SCRAP` (history) | "폐기" | **"불량 처리"** |
| `TRANSFER_TO_PROD` (history) | "창고 반출" | **"창고 → 부서"** |
| `TRANSFER_TO_WH` (history) | "창고 반입" | **"부서 → 창고"** |
| `PRODUCE` (history main) | "생산 \| 입고" | **"생산"** |
| `DISASSEMBLE` (history main) | "분해 \| 출고" | **"분해"** |
| `process` work type (history) | "부서 작업" | **"부서 입출고"** |
| `receive_supplier` sub-label | "외부 입고" | **"원자재 입고"** |

원칙: V2 입력 UI 에서 사용자가 누른 버튼과 history 가 같은 단어를 쓰도록 통일.
싫으시면 `frontend/lib/io/glossary.ts` 한 곳만 수정하면 모든 화면에 반영됩니다.

### 접근성 변경 (P3-1) — 동작 변경

`IoDraftWorkCard` 카드를 누르면 펼쳐지던 것이 → **카드 우측 chevron 버튼**을 누르면
펼쳐집니다. 카드 본문 클릭은 더 이상 펼치기 트리거가 아닙니다. (a11y nested
interactive 제거)

## 롤백

```bash
# 브랜치 통째로 폐기
git checkout main
git branch -D improve-codebase-architecture-20260529

# 또는 특정 커밋만 되돌리기 (예: P0-1 라벨 변경만 되돌림)
git revert 2d67cce0
```

## 다음 단계 권장

1. **사용자 확인**: 라벨 변경(특히 "재작업" → "분해", "새 격리" → "새 불량") 이 현장
   사용자에게 OK 인지 한 번 노출 → 피드백.
2. **권동환 사원님 백엔드 변경 결정**: P0-3 인증 방식·P1-5 Decimal 정밀도·P1-4 분리 순서
   (플랜 Open Questions 참조).
3. **E2E 활성화**: 백엔드 시드 전략 결정 후 `test.fixme` 제거.
4. **`_attic` 실제 정리**: `docs/ATTIC_POLICY.md` 기준으로 사용자가 시점·범위 결정.
