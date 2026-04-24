---
type: index
project: ERP
layer: root
status: active
tags:
  - erp
  - root
  - hub
aliases:
  - ERP
  - ERP Root
  - ERP 프로젝트
---

# ERP

> [!summary] 역할
> 이 Vault 안의 최상위 루트 허브.
> 실제 프로젝트의 큰 폴더들을 한 번에 묶어서, 그래프 뷰와 인수인계 읽기 순서를 함께 잡아준다.

## 최상위 허브

- [[backend/backend|backend]]
- [[frontend/frontend|frontend]]
- [[docker/docker|docker]]
- [[data/data|data]]
- [[docs/docs|docs]]
- [[scripts/scripts|scripts]]
- [[_vault/_vault|_vault]]

## 읽는 순서

1. 처음 읽는 사람
2. ERP MOC
3. backend / frontend
4. data / scripts / docs
5. _vault 대시보드와 시나리오 문서

## 그래프 원칙

- `ERP` 는 최상위 루트 허브다.
- 실제 프로젝트 폴더는 `ERP -> 상위 폴더 허브 -> 개별 파일` 흐름으로 연결한다.
- `_vault` 문서는 원본 코드 폴더와 직접 섞지 않고 `_vault` 내부 허브를 통해서만 연결한다.

## 관련 문서

- [[_vault/guides/ERP_MOC]]
- [[_vault/guides/처음_읽는_사람]]
- [[_vault/dashboards/ERP_Control_Room]]

