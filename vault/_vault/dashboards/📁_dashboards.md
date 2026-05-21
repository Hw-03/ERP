---
type: index
project: DEXCOWIN MES
layer: meta
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_vault/dashboards/
tags: [vault, index, folder-marker]
aliases:
  - "dashboards"
  - "dashboards.md"
---

# 📁 dashboards

> [!summary] 역할
> 시스템 전체를 한 화면에서 조망하는 두 개의 진입점 — Control Room(텍스트 대시보드)과 System Map(캔버스 노드맵) — 이 여기 있다.

> [!info] 메타 영역
> `vault/_vault/` 산하. 가이드 / 대시보드 / 템플릿 / 시스템 메타를 관리하는 레이어.

## 어떤 파일들이 있나

- [[erp/_vault/dashboards/ERP_Control_Room]] — 헬스 카운트(라우터 20개, 화면 5섹션), 최근 변경 10건, 위험 신호, 도메인 의존 관계 mermaid, dataview Active Notes 쿼리 포함. **인수인계 진입 1번 화면.**
- [[erp/_vault/dashboards/ERP_System_Map.canvas]] — Obsidian Canvas. 라우터·화면·도메인을 시각적 노드로 배치한 보드. 텍스트만으로 잡기 어려운 거리감을 한눈에 본다.

## 도메인 컨텍스트

두 파일은 상호 보완 관계다. Control Room은 텍스트 정보 밀도가 높고, System Map은 공간 배치로 흐름을 파악한다. 처음 온 사람은 Control Room → System Map 순서로 읽는 게 자연스럽다.

가이드(`_vault/guides/`)와 함께 **인수인계 진입점**을 구성한다. 이 폴더 자체는 읽기 전용 참조 자원으로 운영하고, 시스템 변경이 있을 때마다 Control Room의 해당 섹션을 갱신하는 게 원칙이다.

## ⚠️ 위험 포인트

- Control Room의 라우터 카운트·화면 섹션은 **수동 관리**. 코드 변경 후 대시보드 갱신을 빠뜨리면 숫자가 틀려진다.
- System Map(.canvas)은 Obsidian Canvas 포맷(JSON). 외부 편집기로 열면 망가질 수 있다.
- "코드와 노트가 다르면 코드가 진실" — 대시보드가 틀렸을 때 코드를 대시보드에 맞추는 방향으로 수정하지 말 것.

## 관련 가이드

- [[erp/_vault/guides/위험지대_지도]] — 위험 영역 상세
- [[erp/_vault/guides/ERP_MOC]] — 도메인별 진입점 허브
- [[erp/_vault/guides/📁_guides]] — guides 폴더 설명
