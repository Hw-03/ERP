---
type: folder-note
source_path: "."
importance: important
layer: meta
graph: hub
updated: 2026-05-22
project: DEXCOWIN MES
---

# 📁 ERP 프로젝트 전체

## 이 폴더는 무엇을 위한 곳인가

DEXCOWIN MES 프로젝트 전체를 Obsidian에서 읽기 좋게 펼쳐 놓은 입구입니다.

## 현장 업무와의 관계

이 시스템은 회사의 품목, 재고, 입출고 요청, 승인, BOM, 불량 처리, 감사 기록을 한 흐름으로 묶어 현장 재고가 어디에 있고 어떤 상태인지 확인하게 해줍니다.

## 언제 보면 좋나

- 프로젝트 전체가 무엇인지 처음 파악할 때
- 어느 폴더부터 봐야 할지 길을 잡을 때
- main과 vault-sync 정책을 다시 확인할 때

## 먼저 읽는 길

1. [[guides/처음_읽는_사람]] — 볼트를 처음 여는 사람을 위한 길잡이
2. [[guides/전체_컨텍스트]] — 프로젝트 전체 흐름 요약
3. [[guides/위험지대_지도]] — 실수하면 큰 영향을 주는 위치
4. [[guides/용어사전]] — 현장 용어와 코드 용어 연결

## 브랜치 정책

- `main`: 코드만 유지합니다. `vault/`를 넣지 않습니다.
- `vault-sync`: `main`과 같은 코드에 `vault/` 설명을 더한 브랜치입니다.
- 설명과 실제 코드가 다르면 실제 코드를 우선합니다.

## 주요 하위 폴더

- [[ERP/backend/📁_backend]] — 화면 요청을 실제 DB 조회, 재고 변경, 승인 처리로 연결하는 FastAPI 서버입니다.
- [[ERP/frontend/📁_frontend]] — 현장 직원과 관리자가 보는 Next.js 화면입니다.
- `_attic/docs/` — 사용법, 운영 절차, 구조 설명의 원본 문서입니다.
- [[ERP/scripts/📁_scripts]] — 백업, 복구, 검증, 데이터 정리를 돕는 실행 도구입니다.
- [[ERP/_attic/data/📁_data]] — 과거 엑셀, CSV, DB 백업 같은 참고 데이터 자료입니다.
- [[ERP/docker/📁_docker]] — 컨테이너 실행을 위한 설정입니다.
- [[ERP/.github/📁_.github]] — GitHub Actions 자동 검증 설정입니다.
- [[ERP/_attic/📁__attic]] — 현재 운영 기준이 아닌 과거 자료 보관소입니다.
- [[ERP/_dev/📁__dev]] — 개발 중 참고한 임시 자료와 작업 흔적입니다.
- [[ERP/📁_.git]] — Git 내부 폴더에 대한 프록시 설명입니다. 실제 `.git/` 폴더는 미러링하지 않습니다.

## 먼저 볼 파일 5개

- [[ERP/README.md]] — 이 문서는 DEXCOWIN MES가 무엇인지, 어떻게 실행하는지, 어떤 폴더를 먼저 봐야 하는지 알려주는 공식 입구입니다.
- [[ERP/start.bat]] — 백엔드와 프론트엔드를 한 번에 켜고 브라우저를 열기 위한 Windows 실행 파일입니다.
- [[ERP/.gitattributes]] — `.gitattributes`는 Git/도구 설정입니다. 프로젝트 구조 안에서 `.gitattributes` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/.gitignore]] — `.gitignore`는 Git/도구 설정입니다. 프로젝트 구조 안에서 `.gitignore` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/.mcp.json]] — `.mcp.json`는 JSON 설정/데이터입니다. 프로젝트 구조 안에서 `.mcp.json` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

> [!info]- 추가 파일
> - [[ERP/CLAUDE.md]] — CLAUDE.md
> - [[ERP/ONBOARDING.md]] — ONBOARDING.md

## 조심할 점

여기는 설명의 입구입니다. 실제 코드는 각 원본 폴더가 기준이고, 설명이 코드와 다르면 코드를 우선합니다.
