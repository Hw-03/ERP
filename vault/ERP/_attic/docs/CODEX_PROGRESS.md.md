---
type: file-explanation
source_path: "_attic/docs/CODEX_PROGRESS.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# CODEX_PROGRESS.md — CODEX_PROGRESS.md 설명

## 이 파일은 무엇을 책임지나

`CODEX_PROGRESS.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `MES 진행 기록`
- `현재 기준`
- `완료된 큰 작업`
- `데이터/코드 체계`
- `재고 구조`
- `Queue/BOM 작업`
- `알림/실사`
- `프론트엔드`
- `2026-04-23 재고 필터 이슈`
- `최근 커밋 요약`

## 연결되는 파일

- [[ERP/_attic/docs/📁_docs]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# MES 진행 기록

이 문서는 큰 기능 단위의 진행 이력을 요약한다. 최신 업무 규칙은 `docs/ITEM_CODE_RULES.md`를 우선한다.

## 현재 기준

- 품목 총수: 722건
- 공정코드: 18개
  - `TR/TA/TF` -> 튜브
  - `HR/HA/HF` -> 고압
  - `VR/VA/VF` -> 진공
  - `NR/NA/NF` -> 튜닝
  - `AR/AA/AF` -> 조립
  - `PR/PA/PF` -> 출하
- `BF`는 사용하지 않는다.
- 품목 코드 포맷: `{모델기호}-{process_type_code}-{일련번호:04d}[-{옵션코드}]`

## 완료된 큰 작업

### 데이터/코드 체계

- `product_symbols`: 제품별 모델 기호 관리
- `option_codes`: `BG`, `WM`, `SV` 옵션 코드
- `process_types`: 18개 공정코드 관리
- `items`: `erp_code`, `symbol_slot`, `process_type_code`, `option_code`, `serial_no` 확장
- 코드 파싱/생성 API와 서비스 레이어 도입

### 재고 구조

- `inventory.pending_quantity` 도입
- `Total = Available + Pending` 기준 도입
- 출고 검증을 가용 재고 기준으로 전환
- 예약, 해제, 확정 처리 서비스 분리

### Queue/BOM 작업

- 생산, 분해, 반품 Queue 배치 구조 도입
- BOM 전개 로직을 서비스 레이어로 이동
- Queue 확정 시 TransactionLog와 VarianceLog 연결
- Scrap, Loss, Variance 기록 API 추가

### 알림/실사

- 안전재고 알림 스캔 API 추가
- 실사 입력과 강제 조정 흐름 추가
- count variance 알림 도입

### 프론트엔드

- 레거시 UI에 재고/창고/관리자 데스크톱 화면 구성
- Queue, 알림, 실사 화면 추가
- 품목 코드, 가용/예약 재고, 예약자 표시 추가
- 재고 필터 UX 개선 진행

## 2026-04-23 재고 필터 이슈
```
