---
layer: .github
---

# ci.yml — GitHub Actions CI

> [!summary] pytest + 컴파일 체크 + openapi drift 검사. 병렬 백엔드/프론트 테스트

## 1. 역할
main/feat/fix/refactor 푸시 + PR 트리거. pytest(-v --cov) + python -m py_compile + openapi-drift 검사. 동시성 cancel_in_progress.

## 2. 실제 원본 위치
erp/.github/workflows/ci.yml

## 3. 관련 형제 파일
- [[../../backend/pytest.ini.md|pytest 설정]]
- [[../../start.bat.md|개발 시작 스크립트]]
