---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/presentation/DEMO_GUIDE.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# DEMO_GUIDE.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/presentation/DEMO_GUIDE.md]]

## 원본 첫 줄 (또는 메타)

```
# DEXCOWIN MES — 시연 기능 정리 (발표자용)

> 라이브 시연 때 화면을 돌며 **무엇을 보여주고 설명할지** 빠짐없이 짚기 위한 참조 문서.
> 데스크탑 전용 (모바일 시연 안 함). 진입: 브라우저 → `/legacy` → **PIN 로그인** → 좌측 사이드바, URL `?tab=…`.
> 발표 슬라이드(`index.html`)의 시연 체크리스트 6항목은 이 문서의 **빠른 동선**과 1:1 대응.

도메인 용어 (틀리면 안 됨):
- 공정 단계: **R 원자재 · A 중간공정 · F 공정완료** (코드 뒷글자)
- 부서 코드 앞글자: 조립 A · 고압 H · 진공 V · 튜닝 N · 튜브 T · 출하 P
- 제품 모델: DX3000(3) · COCOON(7) · SOLO(8) · ADX4000W(4) · ADX6000FB(6)
- 품목코드 = `모델-공정(부서+단계)-일련번호` 예: `3-HF-0001`

---

## ⏱ 빠른 시연 동선 (6분 · 슬라이드 9 체크리스트와 1:1)

발표 중 alt+tab으로 MES 이동 → 아래 순서대로 → 슬라이드 복귀 시 `T`키로 체크.

| # | 슬라이드 항목 | MES 동작 | 메뉴 |
|---|---|---|---|
| 1 | PIN 로그인 | PIN 입력 → 대시보드 진입 | 로그인 |
| 2 | 창고 입출고 요청 | 입출고 → 요청 작성 → "창고 입출고" → 창고→부서 → 품목·수량 → 제출 | §2 |
| 3 | 창고 정/부 승인 처리 | 입출고 → "창고 승인함" → 요청 승인(PIN) | §2 |
| 4 | 부서 재고 현황 확인 | 대시보드 → 부서 필터 → 우측 품목 상세의 부서별 재고 | §1 |
| 5 | BOM 입고 → 하위 자동출고 | 입출고 → "부서 입출고" → 생산 → 완제품 입고 시 하위 자동 출고 확인 | §2 |
```
