---
type: index
project: DEXCOWIN MES
layer: meta
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_vault/guides/
tags: [vault, index, folder-marker]
aliases:
  - "guides"
  - "guides.md"
---

# 📁 guides

> [!summary] 역할
> 인수인계 1순위 자산. 시스템 진입·안전·길찾기·시나리오를 담은 가이드 14종과 Obsidian 인덱스(`_guides.md`) 가 들어 있다.

> [!info] 메타 영역
> `vault/_vault/` 산하. 가이드 / 대시보드 / 템플릿 / 시스템 메타를 관리하는 레이어.

## 어떤 파일들이 있나

폴더 동명 파일(`📁_guides.md` — 지금 이 파일)과 Obsidian 인덱스(`_guides.md`)는 **별개**다. `_guides.md`는 wiki-link 집합소이고, 이 파일은 폴더 자체의 설명서다.

### 🚪 시작 (5종)
- [[erp/_vault/guides/왜_이_시스템인가]] — MES를 직접 만든 이유, 회사 결정 배경
- [[erp/_vault/guides/처음_읽는_사람]] — vault를 처음 여는 사람을 위한 첫날 안내서
- [[erp/_vault/guides/AI_생성_코드_읽는_법]] — Claude/Codex 생성 코드 패턴·주석·네이밍 해석법 (3대 추적 동선)
- [[erp/_vault/guides/바이브_코딩_컨텍스트]] — 바이브 코딩의 특징과 함정, 솔직한 메타
- [[erp/_vault/guides/체크리스트]] — Day 0→5 환경/계정/리뷰 체크리스트

### ⚠️ 안전 (1종)
- [[erp/_vault/guides/위험지대_지도]] — 건드리면 터지는 7개 영역 지도

### 🗺 길찾기 (3종)
- [[erp/_vault/guides/ERP_MOC]] — Map of Content: 도메인별 진입점 허브
- [[erp/_vault/guides/용어사전]] — 56개 도메인 용어 정의
- [[erp/_vault/guides/폴더_지도]] — 루트 폴더 전체 한 줄 안내 (`.claude` / `_attic` / `_dev` 포함)

### 🎭 시나리오 (4종)
- [[erp/_vault/guides/시나리오_재고입출고]] — 입고 → 분배 → 출고 전체 흐름
- [[erp/_vault/guides/시나리오_분해반품]] — 역방향 흐름: 분해·반품·불량 처리
- [[erp/_vault/guides/시나리오_생산배치]] — BOM 기반 생산 묶음 처리
- [[erp/_vault/guides/시나리오_품목등록]] — 품목 등록 및 `item_code` 체계

### ❓ 기타 (1종)
- [[erp/_vault/guides/FAQ_전체]] — 자주 묻는 질문 전체

## 도메인 컨텍스트

인수인계 워크스루의 §0.3에서 이 폴더를 "1순위 자산"으로 지정한다. 새 담당자는 시작 5종을 순서대로 읽고 나서 시나리오로 넘어가는 게 권장 경로다.

가이드와 실제 코드가 어긋날 때는 **코드가 진실**. 이 폴더는 코드를 설명하는 문서이지, 코드보다 먼저다.

## ⚠️ 위험 포인트

- `_guides.md`(Obsidian 인덱스)와 이 파일(`📁_guides.md`)을 혼동하지 말 것. 별개 파일, 별개 역할.
- 가이드를 수정할 때 연결된 wiki-link가 끊기지 않도록 파일명 변경 금지.
- 시나리오 가이드는 실제 라우터·화면 흐름을 기반으로 작성됨 — 라우터 삭제 시 해당 시나리오도 점검 필요.

## 관련 가이드

- [[erp/_vault/guides/_guides]] — Obsidian 인덱스 (wiki-link 집합)
- [[erp/_vault/dashboards/ERP_Control_Room]] — 시스템 전체 조망, 빠른 진입점 포함
- [[erp/_vault/dashboards/📁_dashboards]] — dashboards 폴더 설명
