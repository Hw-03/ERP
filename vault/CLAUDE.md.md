---
type: code-note
project: ERP
layer: docs
source_path: CLAUDE.md
status: active
tags:
  - erp
  - docs
  - ai
  - rules
aliases:
  - AI 작업 규칙
---

# CLAUDE.md

> [!summary] 역할
> Claude AI가 이 프로젝트에서 작업할 때 따라야 하는 **규칙과 컨텍스트**를 정의한 파일.
> Claude Code CLI가 자동으로 읽어서 프로젝트 규칙을 인식한다.

> [!info] 핵심 규칙
> 1. 사용자가 막지 않는 한 **스스로 진행**한다
> 2. 사소한 수정·탐색·실행은 **중간 확인 없이 진행**
> 3. 큰 구조 변경 전에는 짧게 이유 설명 후 진행
> 4. 애매하면 **가장 보수적이고 안전한 방식** 선택
> 5. 문서보다 **현재 실제 코드 연결 구조** 우선

> [!warning] 수정 금지 경로
> - `_archive/`, `_backup/`, `frontend/_archive/`
> - 위 경로는 어떤 경우에도 수정·삭제 금지

> [!info] 프로젝트 구조 요약 (CLAUDE.md 기준)
> - Backend: `backend/` (entry: `backend/app/main.py`)
> - Frontend: `frontend/` (route wrapper와 실제 구현 파일이 다를 수 있음)
> - Data: `data/` (엑셀/CSV 원본)
> - Scripts: `scripts/` (유틸 스크립트)
> - Docs: `docs/` (핸드오버/리포트)

---

## 쉬운 말로 설명

**AI(Claude Code) 가 이 프로젝트에서 일할 때 지켜야 할 규칙을 정리한 설명서**. Claude Code CLI 가 리포지토리 루트에 있는 `CLAUDE.md` 를 자동 인식해서 시스템 프롬프트에 주입 → 매번 알려줄 필요 없이 일관성 유지.

사용자 입장 사용법:
- "Claude 가 이상하게 행동한다" → `CLAUDE.md` 에 더 명확히 규칙 추가
- "특정 폴더는 절대 건드리지 마" → "수정 금지 경로" 목록에 추가
- "응답 스타일 변경" → "응답 스타일" 섹션 업데이트

## 핵심 규칙 요약

1. 자율 진행, 중간 확인 최소화
2. 보수적·안전한 선택
3. 문서보다 실제 코드 우선
4. 수정 금지: `_archive/`, `_backup/`, `frontend/_archive/`
5. 응답: 한국어, 두괄식, 비전공자 대상
6. 보고 형식: 지금 된 것 / 안 된 것 / 다음 할 일

## FAQ

**Q. `_archive/` 수정 금지인데 이 vault 는 왜?**
사용자가 명시적으로 예외 허용. 운영 아카이브는 그대로 두되, `ERP-Vault` 는 참고용 문서로 계속 확장.

**Q. AI 가 규칙 어기면?**
`CLAUDE.md` 자체에 명시된 규칙을 위반하는 일은 드묾. 발견 시 해당 규칙 구체화·예시 추가.

---

## 관련 문서

- [[docs/AI_HANDOVER.md.md]] — AI 작업 인계 문서
- ERP MOC — 전체 프로젝트 맵

Up: ERP MOC
