---
type: code-note
project: ERP
layer: docs
source_path: docs/AI_HANDOVER.md
status: active
tags:
  - erp
  - docs
  - ai
  - handover
aliases:
  - AI 인계 문서
---

# AI_HANDOVER.md

> [!summary] 역할
> AI(Claude 등)가 이 프로젝트를 새로 인수할 때 빠르게 현재 상태를 파악할 수 있도록
> 작성된 **최신 UI 상태 및 구조 요약 문서**.

> [!info] 주요 내용
> - 현재 활성 UI: `frontend/app/legacy/` 아래 3개 탭 구조
>   - `inventory` — 재고 조회 탭
>   - `warehouse` — 창고 입출고 탭
>   - `admin` — 관리자 탭 (핀 인증 필요)
> - 탭 진입점: `DesktopLegacyShell.tsx`
> - 브랜딩: `dexcowin-logo.png` 사용
> - 다크 모드 기본, 라이트 모드 토글 가능

> [!info] 인벤토리 뷰 구조
> - 상단: 검색창 + 칩 필터
> - 중단: KPI 카드 + Insight 카드
> - 하단: 품목 목록 테이블

> [!info] 창고 뷰 구조
> - 좌측: 작업 패널 (모드 선택 + 품목 선택)
> - 우측: 확인/실행 패널

---

## 쉬운 말로 설명

**"AI 교대 근무" 용 인수인계서**. 새로 대화 시작한 Claude/Codex 가 이 파일만 읽으면 지금 UI 가 어떤 상태인지 빠르게 파악. 소스 코드 대신 "화면 구조" 중심 설명.

## 2026-04-22 기준 UI 요약

- 메인 경로: `/` = `/legacy` (같은 화면)
- 레이아웃 분기: `>=1024px` → Desktop, 나머지 → Mobile
- 현재 활성 화면 3개 탭(데스크톱): 재고 / 창고 / 이력 / 관리
- 모바일 탭바 4개: 재고 / 입출고 / 이력 / 관리
- 테마: 다크 기본, 라이트 토글 가능

## AI 가 이 문서에서 얻어야 할 것

1. 지금 쓰이는 코드 경로는 `frontend/app/legacy/` 임
2. 루트 라우트는 레거시 re-export
3. 사이드바 탭 추가/삭제 작업 시 `DesktopLegacyShell` 수정
4. 알림은 `AlertsBanner`, 테마는 `ThemeToggle`
5. 스크린샷은 `docs/design/screens/*.jsx` 참고

## FAQ

**Q. UI 가 문서와 다르면?**
`CLAUDE.md` 원칙: **문서보다 실제 코드 우선**. `DesktopLegacyShell.tsx` 최신 코드가 진실의 기준.

**Q. 이 파일 업데이트 시점?**
큰 UI 구조 변경 시마다. 작은 위젯 수정은 기록 불필요.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopLegacyShell.tsx.md]] — 탭 구조 진입점
- [[docs/CODEX_PROGRESS.md.md]] — 개발 진행 현황
- [[docs/docs]] — docs 폴더 인덱스
- [[CLAUDE.md.md]] — AI 작업 규칙

Up: [[docs/docs]]
