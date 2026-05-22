---
type: file-explanation
source_path: "_attic/docs/research/2026-05-03-monday-checklist.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-03-monday-checklist.md — 2026-05-03-monday-checklist.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-03-monday-checklist.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `월요일 회사 PC 첫 진입 체크리스트 — 2026-05-03`
- `0. 출근 직후 5분 — 환경 동기화`
- `1) 원격 최신 가져오기`
- `2) 로컬 변경 없는지`
- `3) 작업 브랜치로 이동`
- `4) 최근 커밋 확인 (주말 작업 14개 문서 보여야 함)`
- `1. 정적 검증 (10분)`
- `2. 첫 작업 — P-MON-01 (BE-001)`
- `사전 체크`
- `작업 내용`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 월요일 회사 PC 첫 진입 체크리스트 — 2026-05-03

> **작업 ID:** MES-QA-002
> **작성일:** 2026-05-03 (일)
> **대상:** 2026-05-04 (월요일) 회사 PC 첫 작업
> **기준 브랜치:** `feat/hardening-roadmap` (단일)
> **수정 여부:** 없음 (체크리스트만)

---

## 0. 출근 직후 5분 — 환경 동기화

```bash
cd C:/ERP

# 1) 원격 최신 가져오기
git fetch origin

# 2) 로컬 변경 없는지
git status

# 3) 작업 브랜치로 이동
git checkout feat/hardening-roadmap
git pull origin feat/hardening-roadmap

# 4) 최근 커밋 확인 (주말 작업 14개 문서 보여야 함)
git log --oneline -15
```

**확인:**
- [ ] `feat/hardening-roadmap` 에 있다
- [ ] 마지막 커밋이 토요일 `docs: add Saturday research queue` 또는 일요일 마무리 커밋
- [ ] working tree clean

**문제 발생 시:**
- 충돌 → `git status` 로 어떤 파일인지 확인 후 사용자에게 보고
- pull 실패 → 네트워크 / 인증 확인

---

## 1. 정적 검증 (10분)

`docs/research/2026-05-03-static-verification.md` 의 **2~4번 섹션** 실행.

핵심 확인 항목:
- [ ] `backend/app/schemas.py` `ItemUpdate` 에 `process_type_code` 없음 → BE-001 대상 확정
- [ ] `backend/bootstrap_db.py:72` `option_code VARCHAR(2)` → BE-002 대상 확정
- [ ] `backend/app/services/pin_auth.py` 가 SHA-256 사용 → BE-005 별도 PR 확정
- [ ] frontend `npx tsc --noEmit` 에러 0건 → 베이스라인 통과

---

## 2. 첫 작업 — P-MON-01 (BE-001)

### 사전 체크
```
