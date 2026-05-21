---
type: meta
project: DEXCOWIN MES
layer: meta
status: active
created: 2026-04-27
updated: 2026-05-21
tags:
  - vault
  - meta
  - root
  - layer/meta
  - topic/root
aliases:
  - DEXCOWIN MES Vault
  - Vault 루트
  - 인수인계 허브
---

# DEXCOWIN MES Vault

> [!summary] 한 줄
> 이 vault 는 **DEXCOWIN MES** 코드(`erp/`)를 신입이 읽을 수 있게 만든 **분석 지도**다. 코드 사본이 아니다.

> [!info] 파일명과 공식명
> 진입 노트 파일명은 호환을 위해 `ERP.md` 로 유지하지만, 시스템 공식명은 **DEXCOWIN MES** 다. 사용자 노출 텍스트에서 "ERP" / "X-Ray" 는 쓰지 않는다.

---

## 현재 브랜치: `vault-sync`

> [!warning] 브랜치 정책
> - `main` — 코드만 (vault 없음)
> - `vault-sync` — 같은 코드 + `erp/vault/` 인수인계 문서
> 합치지 마라. `main` 에 vault 가 올라가면 코드 PR 리뷰가 진흙탕이 된다.

---

## 빠른 진입점

> [!tip] 처음이라면 여기부터
> [[erp/_vault/guides/처음_읽는_사람]] 한 문서면 1시간 내에 큰 그림이 잡힌다.

### 대시보드 / MOC

- [[erp/_vault/dashboards/ERP_Control_Room]] — 한눈에 보는 상태판
- [[erp/_vault/guides/ERP_MOC]] — Vault 목차(Map Of Content)
- [[erp/_vault/guides/_guides]] — 가이드 인덱스

### 신규 가이드 5종 (Phase 2 로드맵)

> [!info] 신입을 위한 핵심 5종
> 옛 코드와 새 코드의 간극, AI 생성 흔적, 위험 영역을 다룬다. 첫 주에 차례로 읽어라.

- [[erp/_vault/guides/왜_이_시스템인가]] — 왜 자체 MES 를 만들었는가
- [[erp/_vault/guides/바이브_코딩_컨텍스트]] — 이 시스템이 어떻게 태어났는지 (필독)
- [[erp/_vault/guides/AI_생성_코드_읽는_법]] — AI 가 쓴 코드 특유의 함정
- [[erp/_vault/guides/위험지대_지도]] — 함부로 손대면 안 되는 영역
- [[erp/_vault/guides/첫주_체크리스트]] — 1주차 일별 체크리스트

---

## 코드 트리 허브

- [[backend/backend]]
- [[frontend/frontend]]
- [[scripts/scripts]]
- [[docs/docs]]
- [[data/data]]
- [[docker/docker]]
- [[.github/.github]]

## 루트 파일 미러

- [[README.md]] — 원본: `erp/README.md`
- [[CLAUDE.md]] — 원본: `erp/CLAUDE.md`
- [[.gitignore]]
- [[start.bat]]

---

## 원칙

> [!warning] 코드가 정답
> 문서와 실제 코드가 다르면 **코드가 정답이다**. Vault 는 인수인계와 탐색을 돕는 레이어일 뿐, 실행에는 영향이 없다.

> [!quote] 신입에게
> "코드를 외울 필요 없다. 어디를 봐야 할지를 외워라."
