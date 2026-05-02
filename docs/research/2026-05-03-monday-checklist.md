# 월요일 회사 PC 첫 진입 체크리스트 — 2026-05-03

> **작업 ID:** MES-QA-002
> **작성일:** 2026-05-03 (일)
> **대상:** 2026-05-04 (월요일) 회사 PC 첫 작업
> **기준 브랜치:** `feat/hardening-roadmap` (단일)
> **수정 여부:** 없음 (체크리스트만)

---

## 0. 출근 직후 5분 — 환경 동기화

```bash
cd C:/ERP

# 1) 원격 최신 가져오기
git fetch origin

# 2) 로컬 변경 없는지
git status

# 3) 작업 브랜치로 이동
git checkout feat/hardening-roadmap
git pull origin feat/hardening-roadmap

# 4) 최근 커밋 확인 (주말 작업 14개 문서 보여야 함)
git log --oneline -15
```

**확인:**
- [ ] `feat/hardening-roadmap` 에 있다
- [ ] 마지막 커밋이 토요일 `docs: add Saturday research queue` 또는 일요일 마무리 커밋
- [ ] working tree clean

**문제 발생 시:**
- 충돌 → `git status` 로 어떤 파일인지 확인 후 사용자에게 보고
- pull 실패 → 네트워크 / 인증 확인

---

## 1. 정적 검증 (10분)

`docs/research/2026-05-03-static-verification.md` 의 **2~4번 섹션** 실행.

핵심 확인 항목:
- [ ] `backend/app/schemas.py` `ItemUpdate` 에 `process_type_code` 없음 → BE-001 대상 확정
- [ ] `backend/bootstrap_db.py:72` `option_code VARCHAR(2)` → BE-002 대상 확정
- [ ] `backend/app/services/pin_auth.py` 가 SHA-256 사용 → BE-005 별도 PR 확정
- [ ] frontend `npx tsc --noEmit` 에러 0건 → 베이스라인 통과

---

## 2. 첫 작업 — P-MON-01 (BE-001)

### 사전 체크

- [ ] 백엔드 서버 미실행 상태 (수정 후 재기동 필요)
- [ ] `git diff` 비어있음

### 작업 내용

**파일 1:** `backend/app/schemas.py`

```python
# ItemUpdate 클래스에 추가
process_type_code: Optional[str] = None
```

**파일 2:** `backend/app/routers/items.py`

```python
# update_item 함수의 업데이트 루프에 "process_type_code" 추가
for field in (
    "item_name", "spec", "unit", "barcode", "min_stock",
    "process_type_code",   # ← 추가
    # ... 기존 필드
):
```

### 검증

```bash
# 백엔드 재기동
cd backend
python -m uvicorn app.main:app --reload

# 다른 터미널에서
ITEM_ID=1
ORIG=$(curl -s http://localhost:8010/api/items/$ITEM_ID | jq -r '.process_type_code')
echo "원본: $ORIG"

# 라우트는 @router.put("/{item_id}") — PUT 사용 (PATCH 아님)
curl -X PUT http://localhost:8010/api/items/$ITEM_ID \
  -H "Content-Type: application/json" \
  -d '{"process_type_code":"AS1"}' | jq

NEW=$(curl -s http://localhost:8010/api/items/$ITEM_ID | jq -r '.process_type_code')
echo "수정 후: $NEW"

# 원복
curl -X PUT http://localhost:8010/api/items/$ITEM_ID \
  -H "Content-Type: application/json" \
  -d "{\"process_type_code\":\"$ORIG\"}" | jq
```

### 완료 조건

- [ ] PUT 응답에 `process_type_code` 변경 반영
- [ ] GET 으로 재조회 시 변경값 유지
- [ ] 원복 후 baseline 동일
- [ ] `pytest backend/tests/` 통과 (있다면)

### 커밋

```bash
git add backend/app/schemas.py backend/app/routers/items.py
git commit -m "2026-05-04 backend: fix update_item process_type_code missing field"
git push origin feat/hardening-roadmap
```

---

## 3. 두 번째 작업 — BE-003 (문서 정정)

### 작업 내용

`docs/OPERATIONS.md` 의 `/health/detailed` 응답 예시:

| 변경 전 (틀림) | 변경 후 (실제) |
|---|---|
| `"database"` | `"db"` |
| `"tables"` | `"rows"` |
| `"open_queue_count"` | `"open_queue_batches"` |
| `"latest_transaction_at"` | `"last_transaction_at"` |
| (누락) | `"inventory_mismatch_count"` 추가 |

### 검증

```bash
# 실제 응답
curl -s http://localhost:8010/health/detailed | jq

# OPERATIONS.md 와 키 비교
diff <(curl -s http://localhost:8010/health/detailed | jq -r 'keys[]' | sort) \
     <(grep -oP '"\w+"\s*:' docs/OPERATIONS.md | sort -u)
```

### 커밋

```bash
git add docs/OPERATIONS.md
git commit -m "2026-05-04 docs: align /health/detailed field names with main.py"
git push
```

---

## 4. 점심 전까지 작업 (선택)

상황에 따라 다음 중 하나만 진행:

### 옵션 A — COMP-005 (mes-format.ts 신규)

- 신규 파일만 추가, 기존 코드 변경 없음 (위험도 A)
- 1시간 예상
- `frontend/lib/mes-format.ts` 작성 → 빌드 통과 확인

### 옵션 B — BE-002 (option_code VARCHAR 통일)

- bootstrap_db.py 1줄 변경
- 기존 erp.db 영향 없음
- 신규 환경 만들 때만 영향

### 옵션 C — 보류

월요일은 BE-001 + BE-003 만 끝내고 마무리. 화요일에 COMP 작업 시작.

---

## 5. 절대 하지 말 것 (월요일)

- [ ] `claude/analyze-dexcowin-mes-tGZNI` 브랜치 건드리기 (초기 분석용 — 이미 폐기됨, 모든 작업은 `feat/hardening-roadmap` 단일)
- [ ] PIN bcrypt 전환 (BE-005 — 별도 PR로만)
- [ ] DEFAULT_PIN 변경 (`"0000"` 유지)
- [ ] `_archive/` `_backup/` `vault/` 수정
- [ ] 부서·직원 관련 색상 5곳 동시 변경 (COMP-001 화요일에)
- [ ] 입출고 화면 동선 변경 (학습 부담, 따로 일정)
- [ ] redirect-only 페이지 (`app/admin/`, `app/inventory/`, `app/history/`) 삭제 — 사용자 확인 먼저

---

## 6. 막힐 때

| 증상 | 1차 조치 |
|---|---|
| `git pull` 실패 | `git fetch` 만 하고 사용자 확인 |
| `npm run build` 실패 | 에러 로그 그대로 보고 |
| `uvicorn` 안 뜸 | 포트 충돌 (8010) → `netstat` |
| sqlite locked | DB 다른 프로세스 사용 중 — 대기 |
| 모르는 변경 발견 | 절대 덮어쓰지 말고 `git stash` 후 보고 |

---

## 7. 퇴근 전 5분

```bash
# 변경 요약
git log --oneline origin/feat/hardening-roadmap..HEAD

# 푸시 확인
git status

# 다음 날 시작점 메모
echo "월요일 완료: $(git log --oneline -3)" >> docs/research/2026-05-04-monday-log.md
```

- [ ] 모든 변경 커밋 + 푸시 완료
- [ ] 다음 작업 ID 명시 (BE-002 또는 COMP-005)
- [ ] 백엔드 / 프론트 정상 기동 확인 후 종료

---

## 8. 화요일 예고

- COMP-001 (mes-department.ts) — 부서 색상 5곳 통일
- COMP-002 (mes-status.ts) — Tone 통합
- 의존: BE-001 완료 후 ADMIN-002 진입 가능
