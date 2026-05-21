---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/pin-security-migration-plan.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# pin-security-migration-plan.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/pin-security-migration-plan.md]]

## 원본 첫 줄 (또는 메타)

```
# PIN 보안 마이그레이션 설계 — 2026-05-04

> **작업 ID:** MES-BE-005 (설계 단계)
> **작성일:** 2026-05-04 (월)
> **기준 브랜치:** `feat/hardening-roadmap` (단일 — 초기 분석 브랜치 `claude/analyze-dexcowin-mes-tGZNI` 폐기)
> **본 PR 범위:** **설계 문서만**. 코드 / DB / 로그인 흐름 변경 0건.
> **구현 PR:** **별도 PR 로 분리** (D등급 — 인증 영향 큼).

---

## 1. 결론 (한 줄)

SHA-256 단일 해시 + 평문 `DEFAULT_PIN="0000"` 을 **argon2id (1순위) 또는 bcrypt (2순위)** 로 전환. 데이터 마이그레이션은 **lazy** 방식, 신규 컬럼 1개 추가, 기존 컬럼은 잠정 유지. **rollback 가능 설계**.

---

## 2. 현재 구조

### 2-1. 코드 위치

| 파일 | 역할 |
|---|---|
| `backend/app/services/pin_auth.py` | `hash_pin`, `verify_pin`, `DEFAULT_PIN="0000"`, `DEFAULT_PIN_HASH` |
| `backend/app/models.py:311` | `Employee.pin_hash = Column(Text, nullable=True)` |
| `backend/app/routers/employees.py` | PIN 변경 / 검증 / 리셋 (`DEFAULT_PIN_HASH` 비교 사용) |
```
