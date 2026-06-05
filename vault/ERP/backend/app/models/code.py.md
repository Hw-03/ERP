---
type: file-explanation
source_path: "backend/app/models/code.py"
importance: important
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# code.py — 제품기호·공정코드 마스터 표

## 이 파일은 무엇을 책임지나

품목 코드(mes_code)를 이루는 두 가지 코드 마스터를 정의합니다. 제품기호(ProductSymbol)와 공정코드(ProcessType) 입니다.

## 업무 흐름에서의 의미

품목 코드 `기호-공정-일련번호` 에서 앞 두 토막의 의미가 여기서 나옵니다. 어떤 기호가 어떤 모델인지, 어떤 공정코드가 어떤 단계인지의 사전 역할입니다. 모델 관리 화면의 모델 목록도 이 표를 씁니다.

## 언제 보면 좋나

- 모델 기호(예: "346")가 무엇을 뜻하는지 확인할 때
- 공정코드(TR/TA/HR/HA…)의 단계 순서가 필요할 때
- 모델 관리 화면의 표시 순서(드래그 정렬)가 어디 저장되는지 볼 때

## 중요한 내용

- `ProductSymbol` — 제품기호 슬롯(slot 1~100). `symbol`(기호 글자)·`model_name`·`is_finished_good`(완제품 단일슬롯 여부)·`is_reserved`·`display_order`(드래그 정렬 결과).
- `ProcessType` — 공정코드(2글자, 예: TR/TA/HR/HA/VR/VA/NA/AR/AA/PR/PA). `prefix`(T/H/V/N/A/P)·`suffix`(R=Raw/A=Assembly)·`stage_order`(단계 순서).

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/item.py]] — mes_code 의 분해 칸이 이 마스터를 가리킵니다.
- [[ERP/backend/app/models/employee.py]] — 담당 모델 배정이 ProductSymbol.slot 을 가리킵니다.

## 핵심 발췌

```python
class ProcessType(Base):
    code = Column(String(2), primary_key=True)   # TR, TA, HR, HA, ...
    prefix = Column(String(1), nullable=False)   # T / H / V / N / A / P
    suffix = Column(String(1), nullable=False)   # R(Raw) / A(Assembly)
```
