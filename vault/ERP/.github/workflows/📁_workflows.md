---
type: index
project: DEXCOWIN MES
layer: meta
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/.github/workflows/
tags: [vault, index, folder-marker]
aliases:
  - "workflows"
  - "workflows.md"
---

# 📁 workflows

> [!summary] 역할
> `erp/.github/workflows/` 의 vault 미러. 현재 CI 파이프라인은 `ci.yml` 단일 파일로 운영된다.

> [!info] 코드 미러 영역
> 이 폴더는 실제 `.github/workflows/` 를 분석한 노트 모음이다. 원본 파일은 vault 밖에 있다.

## 어떤 파일들이 있나

- [[erp/.github/workflows/ci.yml.md]] — GitHub Actions CI 분석 노트. pytest + lint + tsc + OpenAPI drift 검증 파이프라인 설명.

## 도메인 컨텍스트

`ci.yml` 은 `main`, `feat/**`, `fix/**`, `refactor/**` 브랜치 push 및 PR 이벤트에 트리거된다. `concurrency: cancel-in-progress` 설정으로 중복 실행을 차단한다.

파이프라인이 검증하는 항목:

| 검증 | 명령 / 방법 |
|---|---|
| 백엔드 테스트 | `pytest -v --cov` |
| Python 컴파일 체크 | `python -m py_compile` |
| OpenAPI drift | `_dev/baselines/openapi.json` 과 현재 스펙 비교 |
| 프론트엔드 타입 체크 | `tsc --noEmit` |

로컬에서는 `scripts/dev/verify_local.ps1` 이 같은 흐름을 대신한다. **commit 전에 로컬 검증을 먼저 돌리는 게 CI 실패를 줄이는 가장 빠른 방법**이다.

## ⚠️ 위험 포인트

- `ci.yml` 을 수정하면 PR 차단 조건이 바뀐다. 잡고 있던 검증이 풀리거나 새 조건이 모든 PR을 막을 수 있다 — 수정 전에 영향 범위 파악 필수.
- OpenAPI drift 검증은 `_dev/baselines/openapi.json` 을 기준으로 비교한다. 라우터 시그니처가 바뀌면 이 baseline도 갱신해야 CI가 통과한다.
- `main` 브랜치에 vault 파일이 들어가면 안 된다 (`main` 은 vault-free, `vault-sync` 브랜치에서만 작업).

## 관련 가이드

- [[erp/_vault/guides/위험지대_지도]] — CI 실패 시 영향 포함
- [[erp/_vault/guides/체크리스트]] — commit/push 전 로컬 검증 절차
