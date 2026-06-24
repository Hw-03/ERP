---
type: file-explanation
source_path: "README.md"
importance: important
layer: meta
graph: file
updated: 2026-06-24
project: DEXCOWIN MES
---

# README.md — 프로젝트 공식 소개와 실행 안내

## 이 파일은 무엇을 책임지나

이 문서는 DEXCOWIN MES가 무엇인지, 어떻게 실행하는지, 어떤 폴더를 먼저 봐야 하는지 알려주는 공식 입구입니다.

## 업무 흐름에서의 의미

새 담당자나 운영자가 프로젝트 전체 방향을 가장 빠르게 확인할 때 읽는 문서입니다.

## 언제 보면 좋나

- 처음 셋업할 때 실행 방법을 확인할 때
- 포트나 접속 주소가 맞는지 확인할 때
- 폴더 구조 전체를 한눈에 볼 때

## 중요한 내용

- **주 사용 화면**: `/mes` (2026-06-05 이전에는 `/legacy`였으나 개명됨)
- **dev 포트**: 백엔드 `8011`, 프론트엔드 `3001` (`start.bat` 기준)
- **prod 포트**: 백엔드 `8010`, 프론트엔드 `3000` (prod 환경 별도 운영)
- **프론트 API 도메인 모듈**: `frontend/lib/api/` 하위 15개
- **품목 수 등 수치는 문서에 박지 않음** — `python _attic/backend-scripts/facts.py` 로 확인

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/📁_ERP]] — 이 파일이 속한 폴더의 안내판입니다.
- [[ERP/_attic/docs/OPERATIONS.md]] — 운영 매뉴얼 (포트 충돌, 백업, 헬스체크 등)
- [[ERP/_attic/ONBOARDING.md]] — 신규 합류자 셋업 가이드

## 조심할 점

README가 오래되면 새 사람이 잘못된 실행법·포트·경로를 따라갈 수 있습니다. 큰 구조가 바뀌면 같이 갱신해야 합니다.

## 핵심 발췌

```md
- 백엔드: http://0.0.0.0:8011 (로컬: http://127.0.0.1:8011) — dev 기준. prod는 8010.
- 프론트엔드: http://<LAN IP>:3001 또는 http://localhost:3001 — dev 기준. prod는 3000.
- 주 사용 화면: /mes
- 프론트 API 모듈: frontend/lib/api/ 하위 15개 도메인 모듈
```
