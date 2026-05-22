---
type: file-explanation
source_path: "_attic/outputs/bom_setup/bom.json"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# bom.json — bom.json 설명

## 이 파일은 무엇을 책임지나

`bom.json`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/_attic/outputs/bom_setup/📁_bom_setup]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```json
[
  {
    "parent_erp_code": "3-AA-0002",
    "parent_item_name": "DX3000 LCD BD ASS'Y",
    "parent_process_type": "AA",
    "child_erp_code": "3-AR-0006",
    "child_item_name": "DX3000 POWER BUTTON",
    "child_process_type": "AR",
    "quantity": 1,
    "unit": "EA"
  },
  {
    "parent_erp_code": "3-AA-0002",
    "parent_item_name": "DX3000 LCD BD ASS'Y",
    "parent_process_type": "AA",
    "child_erp_code": "3-AR-0030",
    "child_item_name": "DX3000 FFC 20핀 - 하네스1",
    "child_process_type": "AR",
    "quantity": 1,
    "unit": "EA"
  },
  {
    "parent_erp_code": "3-AA-0002",
    "parent_item_name": "DX3000 LCD BD ASS'Y",
    "parent_process_type": "AA",
    "child_erp_code": "3-AR-0031",
    "child_item_name": "DX3000 EXP KEY 4핀 케이블 - 하네스5 (개당 2개씩)",
    "child_process_type": "AR",
    "quantity": 2,
    "unit": "EA"
  },
  {
    "parent_erp_code": "3-AA-0002",
    "parent_item_name": "DX3000 LCD BD ASS'Y",
    "parent_process_type": "AA",
    "child_erp_code": "3-AR-0035",
    "child_item_name": "DX3000 LCD BD",
    "child_process_type": "AR",
    "quantity": 1,
    "unit": "EA"
  },
  {
    "parent_erp_code": "3-AA-0003",
    "parent_item_name": "DX3000 LCD BD ASS'Y _사파리_원버턴 타입",
    "parent_process_type": "AA",
    "child_erp_code": "3-AR-0001",
    "child_item_name": "DX3000 2.35\" LCD 판넬",
    "child_process_type": "AR",
    "quantity": 1,
    "unit": "EA"
  },
  {
    "parent_erp_code": "3-AA-0003",
    "parent_item_name": "DX3000 LCD BD ASS'Y _사파리_원버턴 타입",
    "parent_process_type": "AA",
```
