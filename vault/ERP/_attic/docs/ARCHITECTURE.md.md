---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/ARCHITECTURE.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# ARCHITECTURE.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/ARCHITECTURE.md]]

## 원본 첫 줄 (또는 메타)

```
# 아키텍처 개요

이 문서는 다음 사람이 한 시간 안에 코드 구조를 머리에 넣을 수 있도록 쓴 짧은 안내서다.

## 스택

- 백엔드: Python 3.13 · FastAPI · SQLAlchemy · SQLite (WAL)
- 프론트엔드: Next.js 14 (App Router) · React · Tailwind · TypeScript strict

## 폴더 구조 (운영에 의미 있는 부분만)

```
ERP/
├── backend/
│   └── app/
│       ├── main.py                  # 라우터 등록, /health, CORS
│       ├── database.py              # SQLite + WAL, get_db
│       ├── models.py                # SQLAlchemy 모델 + 16 enum (621줄)
│       ├── schemas.py               # Pydantic 요청/응답 (40+ 모델)
│       ├── routers/
│       │   ├── inventory.py         # 입출고/이동/불량/CSV·XLSX (~810줄)
│       │   ├── items.py             # 품목 CRUD (~430줄)
│       │   ├── production.py        # 생산 입고 + BOM 자동 차감
│       │   ├── queue.py             # 큐 배치 생성/확정/취소
│       │   ├── bom.py / codes.py / employees.py / alerts.py
```
