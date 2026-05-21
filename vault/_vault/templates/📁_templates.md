---
type: index
project: DEXCOWIN MES
layer: meta
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_vault/templates/
tags: [vault, index, folder-marker]
aliases:
  - "templates"
  - "templates.md"
---

# 📁 templates

> [!summary] 역할
> vault에 새 노트를 작성할 때 참고하는 양식 3종. Obsidian "템플릿 삽입" 기능과 연동된다.

> [!info] 메타 영역
> `vault/_vault/` 산하. 가이드 / 대시보드 / 템플릿 / 시스템 메타를 관리하는 레이어.

## 어떤 파일들이 있나

- [[erp/_vault/templates/Code Note Template]] — 코드 파일 분석 노트용 경량 양식. `source_path` + 역할 + 구조 + FAQ 섹션.
- [[erp/_vault/templates/Dashboard Template]] — 특정 영역을 한눈에 보기 위한 대시보드 양식. dataview 쿼리 슬롯 포함.
- [[erp/_vault/templates/Scenario Template]] — 실제 업무 흐름을 화면·API·DB 관점에서 단계별로 서술하는 양식. 등장 인물/데이터, 흐름, 예외 상황 섹션 구조화.

## 도메인 컨텍스트

세 양식은 vault에서 반복 등장하는 노트 유형을 커버한다.

| 양식 | 사용 시점 |
|---|---|
| Code Note | 라우터·컴포넌트·서비스 파일 한 개를 분석 노트로 남길 때 |
| Dashboard | 특정 도메인이나 레이어의 현황을 한 화면으로 묶을 때 |
| Scenario | 업무 흐름(입출고·생산·반품 등) 워크스루를 작성할 때 |

새 양식을 추가할 때는 frontmatter에 `type`, `project: DEXCOWIN MES`, `status: draft` 를 반드시 포함해야 dataview 쿼리에 잡힌다.

## ⚠️ 위험 포인트

- 기존 양식의 frontmatter 키 이름을 바꾸면 dataview 쿼리 전체가 깨진다. 키 추가는 괜찮지만 키 이름 변경은 파급 범위를 먼저 확인할 것.
- `project: ERP` 로 남아 있는 기존 노트들은 dataview에 안 잡힐 수 있음 — 발견하는 즉시 `project: DEXCOWIN MES` 로 정정.

## 관련 가이드

- [[erp/_vault/guides/📁_guides]] — guides 폴더 설명
- [[erp/_vault/dashboards/📁_dashboards]] — dashboards 폴더 설명
- [[erp/_vault/dashboards/ERP_Control_Room]] — dataview Active Notes 쿼리 실사용 예시
