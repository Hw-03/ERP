---
type: file-explanation
source_path: "docs/defect-handling-redesign.md"
importance: important
layer: docs
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# defect-handling-redesign.md — defect-handling-redesign.md 설명

## 이 파일은 무엇을 책임지나

`defect-handling-redesign.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.

## 업무 흐름에서의 의미

사람이 합의한 기준을 담지만, 코드가 바뀌었을 수 있으므로 현재 코드와 함께 읽어야 합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `불량 처리 흐름 개선 설계`
- `0. 한눈에 보기`
- `1. 배경`
- `1.1 사용자 요구사항 원문`
- `1.2 현재 코드 상태 (조사 결과)`
- `2. 사용자 멘탈 모델 (조직)`
- `3. 데이터 모델 변경`
- `3.1 `InventoryLocation.status``
- `3.2 `Department` 마스터에 `parent_id` 추가`
- `3.3 결재 권한 체크 로직`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/README.md]] — 이 문서는 DEXCOWIN MES가 무엇인지, 어떻게 실행하는지, 어떤 폴더를 먼저 봐야 하는지 알려주는 공식 입구입니다.
- [[ERP/docs/OPERATIONS.md]] — `OPERATIONS.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.
- [[ERP/docs/operations/DAILY_OPERATION_CHECKLIST.md]] — `DAILY_OPERATION_CHECKLIST.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.

## 조심할 점

큰 위험은 낮지만, 연결된 파일과 실행 위치를 확인한 뒤 수정하는 편이 안전합니다.

## 핵심 발췌

```md
# 불량 처리 흐름 개선 설계

> 작성일: 2026-05-21
> 작성 배경: 입출고탭에서 불량 세부 작업(격리·폐기·공급처 반품·재작업)과 부서 결재 로직을 정비하기 위한 그릴(Grill) 인터뷰 결과를 정리한 문서.
> 상태: **설계 합의 완료 / 구현 대기**

---

## 0. 한눈에 보기

| 항목 | 결정 |
|---|---|
| 불량 상태 | `PRODUCTION` / `DEFECTIVE` 2개만 (재작업중 별도 상태 X) |
| 격리 단위 | 부서별로 따로 쌓임 (이미 코드 구조 그대로) |
| 격리 = 재작업 대기 | 같은 풀로 통합. 별도 상태 안 만듦 |
| 부서 조직 | 계층 도입. 생산부 산하에 6라인 |
| 결재 권한 | 생산부장(이필욱·김건호) OR 창고장(정/부) — 라인(튜브/고압/진공/튜닝/조립/출하) 자체에는 별도 부서장 없음 |
| 발의 | 누구나 |
| 격리/정상복귀 | 즉시 (결재 X) |
| 폐기/반품/분해 | 결재 필요 |
| R 처리 | 단순 4버튼 (격리 안 거쳐도 정상에서 바로 가능) |
| PA·PF 처리 | 무조건 격리 → BOM 트리 펼침 |
| 분해 살린 자식 | 분해한 부서의 정상 재고로 즉시 입고 |
| 사유 입력 | 모든 액션 필수 (카테고리 + 자유 메모) |
| UI 위치 | 입출고탭 → 요청 작성 → Step 1 [불량] → **불량 처리 허브** |
| 허브 디자인 | 대시보드 패턴 (KPI 카드 + 액션 + 부서별 목록) |
| 대시보드 표시 | 위치별 재고 카드/게이지에 **빨간색 불량 행/구간** |

---

## 1. 배경

### 1.1 사용자 요구사항 원문

> "입출고탭에서 불량 세부 작업과 부서 로직을 개선해야함.
> 불량 격리, 불량 폐기, 공급처 반품, 재작업..?등등
>
> 불량 격리 시에는 대시보드에 위치별 재고에서 창고에 수량 뜨는거 처럼 불량 수량이 몇개인지 표시해두면 될거 같고. 그렇게 격리해둔 품목을 폐기하거나 다시 입고할 경우도 있으니 이 부분도 생각해봐야함.
>
> 불량 폐기 시에는 바로 재고가 사라지면 됨 물론 내역엔 기록이 남아야함.
> 공급처 반품도 바로 재고가 없어지면 되고 내역에 남기.
> 재작업은....모르겠음.
> 불량 격리되어 있는 품목도 폐기랑 반품을 할 수 있어야함."

### 1.2 현재 코드 상태 (조사 결과)

**이미 있는 것 (백엔드)**
- 트랜잭션 enum에 `MARK_DEFECTIVE`, `SCRAP`, `LOSS`, `SUPPLIER_RETURN`, `RETURN`, `DISASSEMBLE` 존재
  - 파일: [backend/app/models.py:59-75](../backend/app/models.py#L59-L75)
- `InventoryLocation` 테이블에 `status` 컬럼 (PRODUCTION / DEFECTIVE) 존재
  - 파일: [backend/app/models.py:217-251](../backend/app/models.py#L217-L251)
- `dept_adjustment` 라우터/서비스에 `direction="defective"` 라인 처리 로직 존재
  - 파일: [backend/app/services/dept_adjustment.py:196-209](../backend/app/services/dept_adjustment.py#L196-L209)
- `MARK_DEFECTIVE` 라우터 (`POST /api/inventory/mark-defective`) 존재
```
