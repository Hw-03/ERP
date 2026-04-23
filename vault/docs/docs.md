---
type: index
project: ERP
layer: docs
status: active
tags:
  - erp
  - docs
aliases:
  - 문서 폴더
---

# docs

> [!summary] 역할
> AI 핸드오버 문서, 개발 진행 현황, 디자인 파일이 있는 폴더.

## 하위 문서

- [[docs/AI_HANDOVER.md.md]] — AI 작업 인계 문서 (최신 UI 상태, 구조 요약)
- [[docs/CODEX_PROGRESS.md.md]] — 개발 진행 현황 및 완료된 마일스톤 (M1~M7)
- [[docs/CODEX_CONNECTED.md.md]] — Codex 연결 확인 파일
- [[docs/CODEX_MAIN_CHECK.md.md]] — main 브랜치 직접 커밋 확인
- [[docs/ERP_Integration_Report.md.md]] — 데이터 통합 결과 리포트
- [[docs/ERP_Mapping_Sample.md.md]] — 품목 매핑 샘플 30건
- [[docs/design/design]] — UI 디자인 파일 및 스크린샷

---

## 쉬운 말로 설명

프로젝트 **상태와 계약**에 관한 문서 폴더. 코드가 아니라 "어떤 상황인지 / 무엇이 진행됐는지 / 어떤 규칙이 있는지" 기록.

### 세 종류
1. **핸드오버** — 다음 사람(또는 AI)에게 넘길 때 필요한 정보 (`AI_HANDOVER.md`)
2. **진행 기록** — 어디까지 만들었는지 (`CODEX_PROGRESS.md`, `CODEX_MAIN_CHECK.md`)
3. **리포트** — 데이터 통합 결과 (`ERP_Integration_Report.md`)

### design 폴더
[[docs/design/design]] 에는 화면 스크린샷, UI 레퍼런스 이미지.

---

## FAQ

**Q. 왜 md 문서를 이렇게 많이 두는가?**
프로토타입 개발 중 AI 협업(Claude, Codex)을 많이 써서, **문맥 전달용** 문서가 누적. 운영 안정화되면 일부 정리 가능.

**Q. AI_HANDOVER 와 CLAUDE.md 차이는?**
- `AI_HANDOVER.md` — 현재 UI 상태, 화면 레이아웃, 구체적 구현 스냅샷
- `CLAUDE.md` — 작업 규칙, 스타일, 금지 영역

---

## 관련 문서

- [[CLAUDE.md.md]]
- [[README.md.md]]
- ERP MOC

Up: ERP MOC
