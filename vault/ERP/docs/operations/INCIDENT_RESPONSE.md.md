---
type: file-explanation
source_path: "docs/operations/INCIDENT_RESPONSE.md"
importance: important
layer: docs
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# INCIDENT_RESPONSE.md — INCIDENT_RESPONSE.md 설명

## 이 파일은 무엇을 책임지나

`INCIDENT_RESPONSE.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.

## 업무 흐름에서의 의미

사람이 합의한 기준을 담지만, 코드가 바뀌었을 수 있으므로 현재 코드와 함께 읽어야 합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `장애 대응 매뉴얼`
- `즉시 연락처`
- `1. 재고 음수 발생`
- `즉시 조치`
- `1. 서버 즉시 중단 (추가 손상 방지)`
- `Ctrl+C 또는 프로세스 종료`
- `2. 백업 생성`
- `3. 무결성 상세 점검`
- `4. 음수 품목 조회 (SQLite)`
- `복구`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/README.md]] — 이 문서는 DEXCOWIN MES가 무엇인지, 어떻게 실행하는지, 어떤 폴더를 먼저 봐야 하는지 알려주는 공식 입구입니다.
- [[ERP/docs/OPERATIONS.md]] — `OPERATIONS.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.
- [[ERP/docs/operations/DAILY_OPERATION_CHECKLIST.md]] — `DAILY_OPERATION_CHECKLIST.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.

## 조심할 점

큰 위험은 낮지만, 연결된 파일과 실행 위치를 확인한 뒤 수정하는 편이 안전합니다.

## 핵심 발췌

```md
# 장애 대응 매뉴얼
**작성일**: 2026-05-08 | **대상**: DEXCOWIN MES 서버 담당자

---

## 즉시 연락처

> 담당자 정보를 여기에 기재하세요.

---

## 1. 재고 음수 발생

**증상**: preflight 또는 check_inventory_integrity.py 에서 음수 재고 감지

### 즉시 조치

```bash
# 1. 서버 즉시 중단 (추가 손상 방지)
# Ctrl+C 또는 프로세스 종료

# 2. 백업 생성
python scripts/ops/backup_db.py

# 3. 무결성 상세 점검
python scripts/ops/check_inventory_integrity.py

# 4. 음수 품목 조회 (SQLite)
sqlite3 backend/mes.db "SELECT i.item_id, it.item_code, i.warehouse_qty, i.quantity FROM inventory i JOIN item it ON it.item_id = i.item_id WHERE i.warehouse_qty < 0 OR i.quanti...
```

### 복구

```sql
-- 음수 warehouse_qty 0으로 정정 (원인 파악 후 적용)
UPDATE inventory SET warehouse_qty = 0 WHERE warehouse_qty < 0;
UPDATE inventory SET quantity = warehouse_qty + (
    SELECT COALESCE(SUM(quantity), 0) FROM inventory_location WHERE item_id = inventory.item_id
) WHERE item_id = '<문제 item_id>';
```

### 재개 조건

- `check_inventory_integrity.py` 전체 PASS
- preflight 전체 PASS

---

## 2. 503 연속 발생

**증상**: 직원들이 "서버 과부하 — 잠시 후 다시 시도하세요." 메시지를 지속적으로 받음

### 원인 판단

| 패턴 | 원인 | 조치 |
```
