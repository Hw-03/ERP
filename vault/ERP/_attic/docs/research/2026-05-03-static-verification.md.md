---
type: file-explanation
source_path: "_attic/docs/research/2026-05-03-static-verification.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-03-static-verification.md — 2026-05-03-static-verification.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-03-static-verification.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `정적 검증 명령 모음 — 2026-05-03`
- `1. 사전 점검 (월요일 출근 직후 5분)`
- `1) 브랜치 상태`
- `2) 원격 동기화 확인`
- `3) 작업 트리 깨끗한지`
- `2. 백엔드 정적 검증`
- `2-1. 임포트 / 타입 검사`
- `레포 루트에서 실행 (cd 없음)`
- `Python syntax`
- `타입 (mypy 설치 시)`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
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
```
