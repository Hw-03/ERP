---
type: file-explanation
source_path: "CLAUDE.md"
importance: normal
layer: meta
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# CLAUDE.md — CLAUDE.md 설명

## 이 파일은 무엇을 책임지나

`CLAUDE.md`는 문서입니다. 프로젝트 구조 안에서 `CLAUDE.md` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

프로젝트 운영과 개발을 이해하기 위한 보조 정보입니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `CLAUDE.md`
- `Project Rules`
- `Commit / Push`
- `DB / Run / Verify`
- `1. Think Before Coding`
- `2. Simplicity First`
- `3. Surgical Changes`
- `4. Goal-Driven Execution`

## 연결되는 파일

- [[ERP/📁_ERP]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```md
# CLAUDE.md

## Project Rules

- Official system name: **DEXCOWIN MES**. Do not call it ERP or X-Ray in user-facing text or documents.
- backend: `backend/`
- frontend: `frontend/`
- backend entry: `backend/app/main.py`
- Before editing frontend code, verify the real render/import path first.
- If docs and live code disagree, trust the live code.
- Do not edit `_archive/`, `_backup/`, or `frontend/_archive/` unless explicitly asked.
- Do not casually edit `_attic/`; it contains archived source material, backups, and old working notes.
- Do not mix sample data with real data.
- Do not perform large refactors, folder moves, or renames unless explicitly asked.
- Do not rename legacy internal identifiers such as `xray-erp` unless explicitly asked.
- Respond in Korean, conclusion first, short and clear.

## Commit / Push

- Never auto-commit or auto-push.
- Commit and push only when the user explicitly asks.
- When explicitly asked to commit and push, run the required local checks first to avoid GitHub CI failures, and unless told otherwise, commit and push only the changes made in ...

## DB / Run / Verify

- Starting the server must not change the DB.
- Before DB-changing work, briefly explain the impact first.
- For setup, schema changes, migrations, or seed work:

```bash
cd backend
python bootstrap_db.py --all
```

- Run backend:

```bash
cd backend
python -m uvicorn app.main:app --reload
```

- Before commit/push, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1
```

---

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding
```
