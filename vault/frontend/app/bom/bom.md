---
type: index
project: ERP
layer: frontend
source_path: frontend/app/bom/
status: active
tags:
  - erp
  - frontend
  - route
  - bom
aliases:
  - BOM 페이지 라우트
---

# frontend/app/bom

> [!summary] 역할
> `/bom` 경로 라우트. BOM(자재명세서) 조회·관리 화면.

## 관련 문서

- [[backend/app/routers/bom.py.md]]
- [[frontend/app/legacy/_components/DesktopAdminView.tsx.md]]

---

## 쉬운 말로 설명

`/bom` URL로 접속 시 BOM(자재명세서) 화면. BOM 은 "제품 하나 만들 때 어떤 자재가 얼마나 들어가는가"를 기록한 표.

### 할 수 있는 일
- 특정 완제품의 BOM 트리 조회 (어떤 자재가 몇 단계로 들어가는지)
- BOM 라인 추가/수정/삭제
- 순환 참조 감지 (자기 자신을 자식으로 포함하는 오류)

---

## FAQ

**Q. BOM을 바꾸면 진행 중인 생산에 영향이?**
이미 OPEN 상태로 만들어진 배치는 생성 시점 BOM 기준으로 고정. 새 배치부터 새 BOM 반영. 생산 배치 시나리오 참고.

**Q. BOM 트리 깊이 제한은?**
10단계. 순환 참조 방지용. 서비스 코드([[backend/app/services/bom.py.md]])의 `explode_bom()` 에서 강제.

---

## 관련 문서

- [[backend/app/services/bom.py.md]] — BOM 전개 로직
- 생산 배치 시나리오 — BOM 활용 흐름
- 용어 사전

Up: [[frontend/app/app]]
