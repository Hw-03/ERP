---
type: code-note
project: DEXCOWIN MES
layer: docs
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/docs/operations/INCIDENT_RESPONSE.md
tags: [vault, code-note, b-tier]
---

# INCIDENT_RESPONSE.md — 장애 대응 매뉴얼

> [!summary] 역할
> 재고 음수 / 503 연속 발생 같은 주요 장애의 즉시 조치/복구/재개 조건. 담당자 연락처 placeholder.

## 1. 이 파일의 역할
- 즉시 연락처: [담당자 정보를 여기에 기재하세요] (placeholder)
- §1 재고 음수 발생
  - 즉시 조치: 서버 중단 → 백업 → 무결성 점검 → 음수 품목 조회
  - 복구: UPDATE 쿼리로 warehouse_qty 정정
  - 재개 조건: check_inventory_integrity.py PASS
- §2 503 연속 발생: (내용 생략, 추론)

## 2. 실제 원본 위치
`docs/operations/INCIDENT_RESPONSE.md` — 약 80줄

## 3. 주요 명령
```bash
# 서버 즉시 중단
# Ctrl+C

# 백업 생성
python scripts/ops/backup_db.py

# 무결성 점검
python scripts/ops/check_inventory_integrity.py

# 음수 품목 조회 (SQLite)
sqlite3 backend/mes.db "SELECT ... WHERE ... < 0;"
```

## 4. 어디서 쓰이는지
- 장애 발생 시 대응팀 매뉴얼
- DAILY_OPERATION_CHECKLIST.md와 연계

## 5. ⚠️ 위험 포인트
- **담당자 연락처 placeholder** — 실제 정보 입력 필수
- 음수 원인 파악 후 적용 조건 있음 (자체 판단 필요)
- §2 503 연속 발생 내용 불완전 (생략)
- UPDATE 쿼리는 DBA 검증 필수 (치명적 데이터 손실 위험)

## 6. 수정 전 체크
- 담당자 연락처 입력 확인
- scripts/ops/ 명령어 실행 가능 확인
- 복구 쿼리 사전 검증(테스트 DB에서 실행)
