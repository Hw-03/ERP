---
type: file-explanation
source_path: "backend/app/schemas/weekly.py"
importance: important
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# weekly.py — 주간보고·공정·MES코드·생산능력 API 형식

## 이 파일은 뭐예요?

주간보고 화면과, 그와 함께 쓰이는 공정타입·MES코드 변환·BOM 가능 여부·생산능력(capacity) 운영 도구의 데이터 모양을 정의합니다. 이름은 weekly 지만 운영 계산용 응답 형식이 함께 묶여 있습니다.

## 언제 보나요?

- 주간보고 표(공정별 그룹·요약·경고·생산 매트릭스)가 어떻게 내려오는지 확인할 때
- MES코드 파싱/생성, BOM 가능 여부, 생산능력(즉시/최대) 응답 형식을 볼 때

## 중요한 내용 (주요 클래스)

- `WeeklyReportResponse` 와 하위 — `WeeklyGroupReport`/`WeeklyItemReport`(공정별·품목별 증감), `WeeklyReportSummary`, `WeeklyWarning`, `WeeklyProductionModelRow`(생산 매트릭스).
- `ProcessTypeResponse` — 공정타입 마스터(코드·접두·접미·단계 순서).
- `MesCodeParseRequest`/`GenerateRequest`/`MesCodeResponse` — 품목 코드 변환(예: "3-PA-0012").
- `BomCheckResponse`/`BomCheckComponent` — 특정 수량을 만들 수 있는지(부품별 부족분 포함).
- `CapacityResponse`/`CapacityTopItem` — 생산능력. `immediate`(직계 자식 가용 기준 즉시 생산량) / `maximum`(leaf 까지 전개한 이론 최대), `status`(no_target/bom_not_registered/not_producible/producible), 모델별 대표 PF(`representative_items`).
- `BackflushDetail` — 생산 시 자동 차감된 부품 한 줄(item.py 생산입고 응답이 가져다 씀).

## 연결되는 파일

- [[ERP/backend/app/routers/inventory/weekly_report.py]] — 주간보고 API(동결 영역).
- [[ERP/backend/app/schemas/item.py]] — `BackflushDetail` 을 가져다 생산입고 응답에 씁니다.
- [[ERP/backend/app/services/bom.py]] — BOM 전개·생산능력 계산 업무 규칙.

## 조심할 점

주간보고는 동결(완료) 영역입니다. `WeeklyReport*` 형식은 명시 요청 없이 건드리지 마세요. capacity 의 immediate/maximum 정의는 description 에 박혀 있으니 임의 해석 금지.

## 핵심 발췌

```python
CapacityStatus = Literal["no_target", "bom_not_registered", "not_producible", "producible"]


class CapacityResponse(BaseModel):
    immediate: int   # 직계 자식 available 기준 즉시 생산 가능량
    maximum: int     # leaf available 기준 이론 최대
    status: CapacityStatus = "no_target"
```
