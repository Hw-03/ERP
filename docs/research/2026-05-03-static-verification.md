# 정적 검증 명령 모음 — 2026-05-03

> **작업 ID:** MES-QA-001
> **작성일:** 2026-05-03 (일)
> **목적:** 회사 PC 첫 진입 시 코드 변경 없이 실행할 수 있는 검증 스크립트 모음
> **기준 브랜치:** `feat/hardening-roadmap` (단일 — 초기 분석 브랜치 `claude/analyze-dexcowin-mes-tGZNI` 폐기)
> **수정 여부:** 없음 (명령 목록만)

---

## 1. 사전 점검 (월요일 출근 직후 5분)

```bash
# 1) 브랜치 상태
cd /c/ERP && git status && git log --oneline -10

# 2) 원격 동기화 확인
git fetch origin && git log --oneline HEAD..origin/feat/hardening-roadmap

# 3) 작업 트리 깨끗한지
git diff --stat
```

**기대 결과:**
- 현재 브랜치 `feat/hardening-roadmap`
- 로컬 = 원격 동일 커밋 (`34c49a9` 또는 더 최신)
- working tree clean

---

## 2. 백엔드 정적 검증

> **경로 규칙:** 이 섹션의 모든 명령은 **레포 루트(`C:/ERP`)** 기준이다.
> `cd backend` 같은 디렉토리 이동은 하지 마라. 한 디렉토리에서 일관되게 실행한다.

### 2-1. 임포트 / 타입 검사

```bash
# 레포 루트에서 실행 (cd 없음)

# Python syntax
python -m compileall backend/app/ -q

# 타입 (mypy 설치 시)
python -m mypy backend/app/ --ignore-missing-imports 2>&1 | head -40

# 의존성 (가상환경 활성화 상태에서)
pip check
```

### 2-2. DB 스키마 일치성 (BE-002 검증용)

```bash
# bootstrap_db.py 의 option_code 길이 (루트 기준)
grep -n "option_code" backend/bootstrap_db.py

# 기대: VARCHAR(2) → 수정 필요 (BE-002)
# 또는: VARCHAR(10) → 이미 수정됨
```

### 2-3. ItemUpdate process_type_code 누락 (BE-001 검증용)

```bash
# 루트 기준 grep (cd 없음)
grep -A 15 "class ItemUpdate" backend/app/schemas.py

# items.py update_item 루프
grep -B 2 -A 25 "def update_item" backend/app/routers/items.py | head -40

# 라우트 메서드 확인 (PUT 인지 PATCH 인지)
grep -n "@router\.\(put\|patch\)" backend/app/routers/items.py
```

### 2-4. /health/detailed 실제 필드 (BE-003 검증용)

```bash
# 실제 응답 필드명
grep -A 30 "health/detailed\|@app.get.*health" backend/app/main.py | head -50

# 기대: db, rows, inventory_mismatch_count, open_queue_batches, last_transaction_at
```

### 2-5. PIN 보안 현황 (BE-005 검증용)

```bash
# 해시 알고리즘 확인
grep -n "sha256\|bcrypt\|argon2\|hashlib" backend/app/services/pin_auth.py

# DEFAULT_PIN 위치
grep -rn "DEFAULT_PIN\|\"0000\"" backend/app/
```

---

## 3. 프론트엔드 정적 검증

### 3-1. TypeScript 컴파일

> 프론트엔드 명령은 `frontend/` 디렉토리에서 실행해야 한다.
> 이 블록 안에서만 `cd frontend` 하고, 블록 끝나면 `cd ..` 로 루트로 복귀.

```bash
cd frontend

# strict mode 통과 여부
npx tsc --noEmit 2>&1 | head -40

# 빌드 (시간 좀 걸림)
npm run build 2>&1 | tail -20

cd ..   # 루트 복귀
```

### 3-2. ERP 잔재 (NAME 작업 검증용)

```bash
# 루트 기준 (cd 없음)
# Frozen 식별자는 있어도 됨 (formatErpCode, ErpLoginGate 등)
# Grade-A 잔재만 검색
rg -n "ERP 시스템|ERP Master|ERP 마스터" frontend/app/ --glob "!_archive"

# 시스템명 통일 확인
rg -n "DEXCOWIN MES" frontend/app/ | head -10
```

### 3-3. 색상 정의 산재 (COMP-001 검증용)

```bash
# 부서 색상 5곳 위치
rg -n "color_hex|deptColor|departmentColor|COLOR_PALETTE|employeeColor" frontend/ --glob "!_archive" --glob "!node_modules"

# bomCategoryColor 별도
rg -n "bomCategoryColor\|--c-(blue|green|red|orange)" frontend/ --glob "!_archive"
```

### 3-4. StatusPill / StatusBadge 사용처 (COMP-002 검증용)

```bash
rg -n "StatusPill\|StatusBadge" frontend/ --glob "!_archive" --glob "!node_modules"
```

### 3-5. Toast 산재 (COMP-003 검증용)

```bash
rg -n "Toast|toast|setMessage|showToast" frontend/app/legacy/_components/ --glob "!_archive" | head -30
```

### 3-6. 날짜/숫자 포맷 산재 (COMP-005 검증용)

```bash
rg -n "toLocaleString|toLocaleDateString|new Intl\." frontend/ --glob "*.ts" --glob "*.tsx" --glob "!_archive" --glob "!node_modules" | head -30
```

---

## 4. 라우트 / 죽은 코드 점검

### 4-1. redirect-only 페이지

```bash
# 본문이 redirect 한 줄인지
for p in admin inventory history; do
  echo "=== app/$p/page.tsx ==="
  cat frontend/app/$p/page.tsx
done
```

### 4-2. unused 라우트 참조 (TREE-003)

```bash
# bom / operations 가 활성 코드에서 참조되는지
rg -n "/bom\|/operations\|href=\"/bom\"\|href=\"/operations\"" frontend/ --glob "!_archive" --glob "!node_modules"
```

### 4-3. frontend/components/ 3파일

```bash
rg -n "AppHeader|CategoryCard|UKAlert" frontend/ --glob "!_archive" --glob "!node_modules"
```

---

## 5. 도커 / 배포 검증 (BE-004)

```bash
# Dockerfile 포트
grep -n "EXPOSE\|--port\|CMD" backend/Dockerfile

# docker-compose 포트 매핑
grep -n "ports\|8000\|8010" docker-compose.yml

# start.bat 포트
grep -n "8000\|8010" start.bat
```

**기대 결과:** 셋 다 8010 통일.

---

## 6. 데이터 무결성 점검 (월요일 회사 PC 전용 — 모바일/외부 PC 금지)

> **⚠️ DB 접속 원칙**
> - **모바일/외부 PC: DB 접속 절대 금지** (이 섹션은 실행하지 마라)
> - **회사 PC 한정**, 그것도 **백업 후 읽기 전용 점검**으로만 사용
> - SELECT 만 허용, INSERT/UPDATE/DELETE/DROP 금지
> - 백엔드 서버가 떠 있을 때는 SQLite WAL 락 주의 — 가능하면 서버 정지 후 실행

### 사전 준비 (필수)

```bash
# 1) 백엔드 서버 정지 확인
ps aux | grep uvicorn | grep -v grep   # 비어있어야 안전

# 2) DB 파일 백업 (현재 시각 스탬프)
cp backend/erp.db "backend/erp.db.bak.$(date +%Y%m%d-%H%M%S)"
ls -la backend/erp.db.bak.*
```

### 읽기 전용 점검 (백업 완료 후에만)

```bash
# SELECT 전용 — 어떤 명령도 데이터 변경 금지
sqlite3 backend/erp.db "SELECT COUNT(*) AS items FROM items;"
sqlite3 backend/erp.db "SELECT COUNT(*) AS empty_proc FROM items WHERE process_type_code IS NULL OR process_type_code = '';"
sqlite3 backend/erp.db "SELECT COUNT(*) AS short_opt FROM items WHERE LENGTH(option_code) > 2;"

# inventory mismatch
sqlite3 backend/erp.db "SELECT COUNT(*) FROM inventory_locations WHERE warehouse_qty < 0 OR pending_quantity < 0;"
```

### 위험도

**C등급** (읽기 전용이라도 DB 파일 핸들 점유 → 운영 영향 가능). 다른 섹션(2~5번)과 분리.

---

## 7. 한 줄 종합 점검

```bash
# 모든 정적 검증을 한 번에
cd /c/ERP && \
  echo "=== git ===" && git status -s && \
  echo "=== backend syntax ===" && python -m compileall backend/app/ -q && \
  echo "=== frontend tsc ===" && cd frontend && npx tsc --noEmit 2>&1 | tail -5 && cd .. && \
  echo "=== ERP residue ===" && rg -c "ERP 시스템\|ERP Master" frontend/app/ --glob "!_archive" || echo "none" && \
  echo "=== done ==="
```

---

## 8. 위험도

| 섹션 | 등급 | 환경 |
|---|---|---|
| 1. 사전 점검 (git) | A | 어디서든 |
| 2. 백엔드 grep / compile | A | 어디서든 (읽기 전용) |
| 3. 프론트엔드 tsc / build / rg | A | 어디서든 |
| 4. 라우트 / 죽은 코드 grep | A | 어디서든 |
| 5. 도커 / 배포 grep | A | 어디서든 (파일 grep 만) |
| **6. DB 무결성 SELECT** | **C** | **회사 PC 전용, 백업 후** |
| 7. 한 줄 종합 (DB 미포함) | A | 어디서든 |

월요일 첫 진입 시 1~5, 7번을 위에서부터 순서대로 실행. **6번은 회사 PC 에서 백업 후에만**.
