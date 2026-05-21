---
type: code-note
project: DEXCOWIN MES
layer: meta
status: active
created: 2026-04-27
updated: 2026-05-21
tags:
  - vault
  - meta
  - root
  - mirror
  - layer/meta
  - topic/root
aliases:
  - README 미러
  - 루트 README 인수인계
source_path: erp/README.md
---

# README.md (코드 미러)

> [!summary] 역할
> 이 노트는 `erp/README.md` 를 신입이 빠르게 훑을 수 있게 정리한 **분석 지도**다. 코드 사본이 아니다.

> [!warning] 원본 위치
> 실제 수정은 원본에서만 한다.
> - 원본: `erp/README.md`
> - 이 미러: `erp/vault/README.md.md`

---

## 원본 핵심 요약

> [!info] DEXCOWIN MES 한 줄
> DEXCOWIN 의 품목, 재고, BOM, 입출고를 관리하는 경량 MES 프로토타입.

### 현재 기준 (원본 발췌)

- 기준 품목 수: **722건**
- 백엔드: FastAPI + SQLAlchemy + SQLite (`erp/backend/mes.db`)
- 프론트엔드: Next.js 14 + Tailwind CSS
- 주 사용 화면: `/legacy` (대시보드 / 입출고 / 입출고 내역 / 관리자)
- 안정성 점수: ~96/100 (Round-10A, 2026-05-02)

### 빠른 시작 (Windows)

> [!tip] 한 번에 띄우기
> 루트의 `erp/start.bat` 실행만으로 백엔드·프론트가 함께 뜨고 LAN IP 브라우저가 자동 실행된다.
> - 백엔드: `http://127.0.0.1:8010`
> - 프론트: `http://<LAN IP>:3000`

수동 실행은 `erp/README.md` 의 "수동 실행" 절 참고.

### 5게이트 검증 (커밋 전 필수)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1
```

backend pytest / frontend lint:strict / tsc / vitest+coverage / next build / OpenAPI drift 6개 게이트를 CI 와 동일 기준으로 검사.

---

## 문서 허브 (원본에서 링크되는 위치)

| 대상 | 문서 |
|---|---|
| 현장 사용자 | `erp/docs/USER_GUIDE.md` |
| 운영자 | `erp/docs/OPERATIONS.md` |
| 개발자 (구조) | `erp/docs/ARCHITECTURE.md` |
| 개발자 (ERD) | `erp/docs/ERD.md` |
| 모두 (용어) | `erp/docs/GLOSSARY.md` |
| 모두 (품목코드) | `erp/docs/ITEM_CODE_RULES.md` |
| AI 협업자 | `erp/docs/AI_HANDOVER.md` |

> [!tip] vault 안에서 같은 자료를 더 쉽게 보려면
> - 신입 첫날 안내: [[erp/_vault/guides/처음_읽는_사람]]
> - 용어 모음: [[erp/_vault/guides/용어사전]]
> - MOC: [[erp/_vault/guides/ERP_MOC]]

---

## 미러의 본질

> [!warning] 이건 코드 사본이 아니다
> 원본 `erp/README.md` 의 일부 표·코드 블록은 의도적으로 옮기지 않는다. 이 노트는 **원본을 어디서 어떻게 읽을지** 가르치는 지도일 뿐이다. 사실 검증은 항상 원본을 본다.

> [!quote] 코드가 정답
> 미러와 원본이 다르면 원본을 따른다. 원본과 실제 코드가 다르면 **코드를 따른다**.

---

Up: [[ERP]]
