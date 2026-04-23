---
type: code-note
project: ERP
layer: docs
source_path: docs/CODEX_PROGRESS.md
status: active
tags:
  - erp
  - docs
  - progress
  - milestone
aliases:
  - 개발 진행 현황
---

# CODEX_PROGRESS.md

> [!summary] 역할
> AI(Codex/Claude)가 완료한 마일스톤과 작업 진행 이력을 기록하는 **핸드오버 문서**.
> 브랜치, 작업자, 커밋 정보를 포함해 다음 작업자가 이어받을 수 있도록 한다.

> [!info] 완료된 마일스톤 (M1~M7)
> | 마일스톤 | 내용 |
> |---------|------|
> | M1 | 데이터 모델 확장 + 신규 테이블 9종 |
> | M2 | ERP 코드 체계 서비스 + 라우터 |
> | M3 | Pending/Available 재고 분리 |
> | M4 | Queue 배치 (생산/분해/반품) |
> | M5 | Scrap / Loss / Variance 손실 관리 |
> | M6 | 안전재고 알림 + 실사 기능 |
> | M7 | 프론트엔드 UX |

---

## 쉬운 말로 설명

**이 프로젝트의 "공사 일지"**. 어떤 큰 단계(M1~M7)를 언제 누가 끝냈는지 기록. 코드 히스토리와 별개로 "우리가 어디까지 왔나" 를 한눈에.

## 각 마일스톤 실체

| M | 결과물 |
|---|-------|
| M1 | `models.py` 테이블 9개 추가 (Pending, VarianceLog, QueueBatch 등) |
| M2 | `services/codes.py` + `/api/codes` 엔드포인트 |
| M3 | `reserve_pending / consume_pending / release_pending` 함수 |
| M4 | `services/queue.py` `confirm_batch()` 로직 |
| M5 | Scrap/Loss/Variance 별 라우터 + 이력 |
| M6 | `/alerts/summary` + `/counts` 실사 API |
| M7 | `DesktopLegacyShell` + 6개 WORK_TYPES |

2026-04-22 기준 M1~M7 모두 운영 반영. 다음은 M8 (UI 리팩토링 또는 PostgreSQL 이관) 논의 단계.

## FAQ

**Q. 누가 작성?**
대부분 Claude Code. Codex 초기 참여 흔적(`CODEX_CONNECTED.md`) 남아있음.

**Q. 상세 진행 확인?**
git log + PR 설명 참조. 이 파일은 큰 덩어리만.

---

## 관련 문서

- [[docs/AI_HANDOVER.md.md]] — 최신 UI 상태 요약
- [[docs/CODEX_CONNECTED.md.md]] — 연결된 기능 목록
- ERP MOC — 전체 맵

Up: [[docs/docs]]
