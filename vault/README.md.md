---
type: code-note
project: ERP
layer: docs
source_path: README.md
status: active
tags:
  - erp
  - docs
  - overview
aliases:
  - 프로젝트 README
---

# README.md

> [!summary] 역할
> ERP 프로젝트의 **공개용 개요 문서**.
> 프로젝트 목적, 입력 파일 구성, 산출물, 실행 방법을 설명한다.

> [!info] 프로젝트 목적
> 정밀 X-ray 발생 장치 제조사의 부서별로 파편화된 엑셀 자재 파일을
> **단일 표준 마스터 DB**로 통합하고 SQL 기반 ERP 시스템으로의 이관을 준비한다.

> [!info] 입력 파일 3종
> | 파일 | 역할 |
> |------|------|
> | `F704-03 (R00) 자재 재고 현황.xlsx` | 원자재 마스터 (Baseline) |
> | `2026.03_생산부 자재_조립,출하파트.xlsx` | 조립/출하팀 자재 |
> | `2026.03_생산부 자재_고압,진공,튜닝파트.xlsx` | 고압/진공/튜닝팀 자재 |

> [!info] 주요 산출물
> - `ERP_Master_DB.csv` — 통합 마스터 DB
> - `ERP_Source_Links.csv` — 원본 행 매핑
> - `ERP_Integration_Report.md` — 통합 결과 리포트
> - `schema.sql` — PostgreSQL 이관 스키마

---

## 쉬운 말로 설명

**프로젝트 겉표지**. Github 에 접속한 누군가가 맨 처음 읽는 문서. 프로젝트가 뭔지, 왜 있는지, 어떻게 돌려보는지 요점만 정리.

내부 개발자용 상세 규칙은 `CLAUDE.md`, AI 핸드오버는 `docs/AI_HANDOVER.md` 로 분리.

## 2026-04-22 기준 현황

- 971개 품목 통합 완료
- FastAPI + Next.js 15 기반 프로토타입 운영 중
- NAS 서버에서 Docker 기반 서비스 중 (`docker-compose.nas.yml`)
- 실제 자재 엑셀 주기적 반영 중

## FAQ

**Q. 공개 저장소인가?**
아님. 사내 참고용 + 개인 학습용.

**Q. 새 멤버 온보딩?**
이 README → `CLAUDE.md` → `docs/AI_HANDOVER.md` → `ERP MOC.md` 순서로 읽으면 전체 파악.

---

## 관련 문서

- [[data/data]] — 데이터 파일 목록
- [[scripts/erp_integration.py.md]] — 통합 스크립트
- [[schema.sql.md]] — SQL 스키마
- ERP MOC — 전체 맵

Up: ERP MOC
