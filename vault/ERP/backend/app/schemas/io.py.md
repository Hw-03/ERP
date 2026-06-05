---
type: file-explanation
source_path: "backend/app/schemas/io.py"
importance: critical
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# io.py — 입출고 2.0 미리보기·임시저장·제출 API 형식

## 이 파일은 뭐예요?

새 입출고(IO) 흐름의 데이터 모양을 정의합니다. 작업자가 품목을 고르면 BOM 을 펼쳐 미리보기를 보여 주고, 작업을 임시저장(draft)했다가 제출하면 하나의 작업 묶음(배치)으로 처리하는 단계의 요청·응답 형식이 여기 모여 있습니다.

## 언제 보나요?

- 입출고 화면의 미리보기(번들·라인·BOM 자동 펼침)가 어떤 형식으로 내려오는지 확인할 때
- 임시저장(이어 작업)과 제출이 같은 형식을 어떻게 공유하는지 볼 때
- 제출 결과가 결재 필요(`requires_approval`)로 갈리는 지점을 볼 때

## 중요한 내용 (주요 클래스)

- `IoPreviewRequest`/`IoPreviewResponse` — 미리보기. 대상(`targets`)을 받아 번들 목록을 돌려줌.
- `IoBundlePayload` / `IoLinePayload` — 번들(품목 묶음)과 그 안의 라인. 라인은 방향(`direction`), 출발·도착(`from_bucket`/`to_bucket`), BOM 기대량(`bom_expected`), 포함 여부(`included`), 부족분(`shortage`) 등을 담습니다.
- `IoDraftUpsert` — 임시저장. `batch_id` 가 있으면 그 draft 를 갱신, 없으면 새 슬롯 생성.
- `IoSubmitRequest` — 제출. `IoDraftUpsert` 를 그대로 상속하되 submit 경로는 `batch_id` 를 무시.
- `IoBatchResponse` — 제출된 작업 묶음 전체. 요청자·승인자, 출발·도착 부서, `stock_request_id` 연결, 번들 목록.
- `IoSubmitResponse` — 제출 결과(배치 + 결재 필요 여부 + 연결된 요청 id + 메시지).

## 연결되는 파일

- [[ERP/backend/app/models/io_batch.py]] — 이 형식이 비추는 실제 배치·번들·라인 표.
- [[ERP/backend/app/services/io.py]] — BOM 펼침·번들 구성·제출 처리 업무 규칙.
- [[ERP/backend/app/routers/io.py]] — 이 형식을 입출력으로 쓰는 입출고 API.
- [[ERP/backend/app/schemas/stock_request.py]] — 결재가 필요한 제출은 입출고 요청과 이어집니다.

## 조심할 점

draft 와 submit 이 한 형식 계열(`IoDraftUpsert` → `IoSubmitRequest`)을 공유하므로, 한쪽 필드를 바꾸면 다른 쪽도 영향을 받습니다. `batch_id` 의 의미(draft=이어작업 / submit=무시)를 헷갈리지 마세요.

## 핵심 발췌

```python
class IoDraftUpsert(BaseModel):
    requester_employee_id: uuid.UUID
    work_type: str
    sub_type: str
    batch_id: Optional[uuid.UUID] = None   # draft: 이어작업 / submit: 무시
    bundles: List[IoBundlePayload] = Field(default_factory=list)


class IoSubmitRequest(IoDraftUpsert):
    pass
```
