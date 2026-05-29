# DB 전반 정규화 계획

**작성일:** 2026-05-29
**작업자:** 김현우 (본인)
**기간:** 권동환 사원 휴직 (~2026-06-15) 동안
**리뷰:** 권동환 사원 복귀(6/16) 후 코드리뷰 집중 진행 (5/29 회신 확인)

---

## 1. 배경

[김현우.md](feedback/김현우.md) "DB — 분해 필드 진실 소스화 + Generated Column / 다중 모델 정규화 검토" 항목에서 출발.

품목 코드 자동 갱신 작업 중 발견한 구조 결함 — items 테이블에 같은 정보가 5개 컬럼에 중복 저장.

| 컬럼 | 예시 |
|---|---|
| `model_symbol` | `8` |
| `process_type_code` | `AR` |
| `serial_no` | `307` |
| `option_code` | `BG` |
| `item_code` | `8-AR-0307-BG` ← 위 4개의 조합 |

진실 소스 중복 → 어느 한 컬럼만 어긋나도 정합성 깨짐. 누적된 사례 모두 같은 패턴:

- 김민재 SOLO 필터 누락
- 김건호 BOM 소수점
- 김현우 prefix 자동 갱신 안 됨
- VA→HF 카테고리 이동 시 코드 안 바뀜
- model_symbol NULL 인데 item_code 있음 (9-TR-0016 등)

---

## 2. 현재 상태 (3ae03f99 까지 완료)

- 사용자 item_code 직접 입력 차단 (수정 폼 readonly) ✓
- 백엔드 자동 계산 + 자동 갱신 (`update_item`) ✓
- DB 어긋남 0건 (34건 → 0건 일괄 정리 완료) ✓
- item_models 폐기 → prefix 기반 model_slots/필터 ✓

→ 이번 작업은 **그 위에 올라가는 구조적 강화**.

---

## 3. 목표

> **앞으로 어떤 수정을 하든 DB 는 건드리지 않고 작업 가능한 상태로 정규화.**

코드만 손봐도 데이터 정합성은 DB 가 알아서 보장. AI 활용 작업이 _코드 변경 → 즉시 안전_ 형태로 단순해짐.

---

## 4. 작업 영역 5개

### A. 진실 소스 단일화 — Generated Column 도입 (우선순위 ⭐)

SQLite `GENERATED ALWAYS AS (...) STORED` 사용:

```sql
item_code TEXT GENERATED ALWAYS AS (
  model_symbol || '-' || process_type_code || '-' ||
  printf('%04d', serial_no) || COALESCE('-' || option_code, '')
) STORED
```

- DB 가 자동 계산 → 사용자·코드 둘 다 직접 못 만짐 → 어긋남 원천 차단
- `make_item_code` 백엔드 호출 다 제거 가능
- 인덱스 가능 → 조회 빠름
- 마이그레이션: 컬럼 재정의 (기존 데이터 보존)

### B. 마스터 데이터 무결성 강제

- 분해 필드 4개 NOT NULL 제약 (현재 model_symbol NULL 2건 = 9-TR-0016, 9-TR-0018)
- `process_type_code` FK → `process_types`
- `model_symbol` FK 또는 ProductSymbol 마스터 정비 (9 등록 또는 다중 모델 표현 정리)
- CHECK 제약 — option_code 알파벳 2자리 등

### C. 1NF 위반 영역 정리

대표 사례: `346789-VR-0004` — 한 컬럼에 5개 값.

선택지 ([김현우.md:64](feedback/김현우.md#L64) 참조):

1. **현재 그대로 유지** (다중 글자 + LIKE/INSTR) — 부품 1000~2000 정도면 충분히 빠름. **권장.**
2. item_models 테이블 부활 + 자동 동기화 — 이번 세션 폐기 결정 되돌림.
3. JSON 배열 컬럼 — SQL 복잡, 인덱스 약함.

→ **1번 유지**가 운영 안정성·SQL 단순함 면에서 정답. C 영역은 사실상 _의식적 결정 기록_으로 마무리.

### D. 데드 컬럼·테이블 제거

- `legacy_part`, `legacy_item_type` — items 컬럼. 사용처 확인 후 제거 검토
- `symbol_slot` — model_slots 폐기 후 잔재 여부 확인
- 다른 테이블의 미사용 컬럼·테이블 스캔

### E. 채번·자동 계산 규칙 코드 한 곳에 집중

- 현재 `backend/app/utils/item_code.py` 에 모임 — 분산되지 않도록 유지
- A (Generated Column) 도입되면 `make_item_code` 호출처 정리

---

## 5. 진행 순서 (제안)

점진적 진행 — 한 영역씩.

1. **A 시도** — Generated Column 마이그레이션 작성 + 로컬 검증 → `make_item_code` 호출처 정리
2. **B 적용** — NOT NULL 채움 (9-TR-0016/0018 처리 = ms='9') → ProductSymbol 마스터 9 등록 → NOT NULL/FK 제약 추가
3. **D 스캔** — 사용처 없는 컬럼·테이블 식별 → 드롭
4. **C 결정 기록** — ADR 또는 docs 메모로 "1NF 유지" 명시
5. **E 회귀 점검** — A 이후 잔재 호출 제거

각 영역 단위로 마이그레이션 + 테스트 + 커밋 분리.

---

## 6. 권동환 사원 가이드 4번과 묶기

[project_itemcode_direction](C:/Users/user/.claude/projects/c--ERP/memory/project_itemcode_direction.md) — 큰 틀 `ItemCode` 도메인을 `erp_code`/`mes_code` 기준으로 전환 방향.

→ 마이그레이션을 어차피 새로 쓰는 시점이라 도메인명 변경을 같이 묶으면 자연스러움. **단**, 권동환 사원 복귀 후 협의 필요 사항이므로 _마이그레이션 파일 분리_·_커밋 분리_ 해두고 도메인 rename 은 6/16 이후 확정.

---

## 7. 보고

[feedback_weekly_report_exclusions](C:/Users/user/.claude/projects/c--ERP/memory/feedback_weekly_report_exclusions.md) 규칙 7 적용. 주간보고에 진행 결과 적을 때:

> "권동환 사원 가이드 + 김현우 본인 발견 결함에 따른 DB 정규화 — Phase N: 어떤 작업"

본인 단독 작업처럼 표기하지 말 것.

매주 주간보고 사전 피드백 메일로 권동환 사원에게 진행 사항 공유 (5/22 메일 "사전 협의" 원칙).

---

## 8. 주의

- 권동환 사원 5/29 회신: **백엔드 포함 모든 파일 선행작업 OK**. 휴직 기간에 자유롭게 진행 가능
- 일관된 코드 스타일 (PEP8/Black, Prettier/ESLint) 같이 적용 — 복귀 후 코드리뷰
- 분해 필드 4개는 **진실 소스 그대로 유지**. item_code 는 _계산 결과_로 격하
- 각 마이그레이션 작업 전 DB 백업 필수 (`backend/data/db_backups/`)
- `bootstrap_db.py --all` 영향 확인. 서버 기동 시 DB 변경 없음 원칙 유지

---

## 9. 참고

- [김현우.md](feedback/김현우.md) — 발견 시점·현재 상태
- [project_itemcode_direction](C:/Users/user/.claude/projects/c--ERP/memory/project_itemcode_direction.md) — 도메인명 방향 메모
- [project_kwon_donghwan_requests](C:/Users/user/.claude/projects/c--ERP/memory/project_kwon_donghwan_requests.md) — 권동환 사원 요청 3건 + 5/29 회신
- 3ae03f99 커밋 — 자동 갱신 + item_models 폐기 + 34건 정리
