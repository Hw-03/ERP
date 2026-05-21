---
type: code-note
project: DEXCOWIN MES
layer: docs
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/docs/operations/DAILY_OPERATION_CHECKLIST.md
tags: [vault, code-note, b-tier]
---

# DAILY_OPERATION_CHECKLIST.md — 일일 운영 체크리스트 (30명 기준)

> [!summary] 역할
> 매 근무일 시작(오전 8시) / 중(30분마다) / 종료 시 수행할 점검 항목. 판정 기준 + 장애 대응 흐름 포함.

## 1. 이 파일의 역할
- 아침 8시 전: preflight / 재고 무결성 / RESERVED 요청 / DB 백업
- 운영 전 확인: PostgreSQL 환경변수 / 담당자 PIN / 동시 사용자 예측
- 운영 중(30분): 503 오류 모니터링 (3건 이상 → 장애 대응)
- PASS/FAIL 판정 기준 포함

## 2. 실제 원본 위치
`docs/operations/DAILY_OPERATION_CHECKLIST.md` — 약 120줄

## 3. 주요 명령
```bash
python scripts/ops/preflight_30_users.py --url http://localhost:8000
python scripts/ops/check_inventory_integrity.py
python scripts/ops/backup_db.py
```

## 4. 어디서 쓰이는지
- 운영팀 매일 아침 루틴
- 장애 대응 절차 참고
- SLA 준수 확인

## 5. ⚠️ 위험 포인트
- **scripts/ops/ 파일들이 실제로 구현되어 있는가?** — 문서만 있고 구현 없을 수 있음
- preflight 전 항목 FAIL → 운영 불가 (치명적 조건)
- 50건 초과 RESERVED → 알림만 있고 자동 해결책 없음

## 6. 수정 전 체크
- python scripts/ops/preflight_30_users.py 존재 확인
- 체크리스트의 모든 명령 실행 가능 확인
- 장애 대응 절차로 연결(INCIDENT_RESPONSE.md)
