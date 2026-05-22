---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-04-dockerfile-port-alignment.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-04-dockerfile-port-alignment.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-04-dockerfile-port-alignment.md]]

## 원본 첫 줄 (또는 메타)

```
# Dockerfile 포트/실행 정렬 — 2026-05-04

> **작업 ID:** MES-DEPLOY-001
> **작성일:** 2026-05-04 (월)
> **기준 브랜치:** `feat/hardening-roadmap`
> **수정 여부:** Dockerfile 2건만 수정. compose 는 다음 작업.

---

## 1. 변경 요약

### backend/Dockerfile

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| EXPOSE | 8000 | **8010** |
| CMD | `uvicorn ... --port 8000 --reload` | `uvicorn ... --port 8010` (no reload) |

### frontend/Dockerfile

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| 의존성 설치 | `npm install` | **`npm ci`** (lock 정합성 강제) |
| 빌드 | (런타임 실행) | **`RUN npm run build`** (이미지 빌드 시) |
| 환경 | — | `NEXT_TELEMETRY_DISABLED=1` |
```
