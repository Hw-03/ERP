---
type: file-explanation
source_path: "backend/app/schemas/__init__.py"
importance: normal
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# __init__.py — schemas 패키지 재공개(re-export)

## 이 파일은 뭐예요?

`schemas/` 패키지의 입구입니다. 도메인별로 쪼갠 모든 형식 파일을 한곳으로 다시 내보내(re-export) 줍니다. 덕분에 다른 코드는 파일이 어디로 나뉘었는지 몰라도 `from app.schemas import ItemResponse` 한 줄로 예전처럼 모든 클래스를 불러올 수 있습니다.

## 언제 보나요?

- `from app.schemas import X` 가 실제로 어느 파일에서 오는지 추적할 때
- 새 schema 모듈을 추가하고 여기서 재공개를 빠뜨려 import 가 깨졌을 때

## 중요한 내용

- 각 도메인 모듈을 `from app.schemas.<모듈> import *` 로 모두 끌어옵니다.
- `common` 을 가장 먼저 로드합니다(다른 모듈이 `UtcDatetime` 등 공용 요소에 의존하기 때문).

## 연결되는 파일

- [[ERP/backend/app/schemas/📁_schemas]] — 이 입구가 모아 주는 패키지 전체.
- [[ERP/backend/app/models/__init__.py]] — 같은 방식으로 models 패키지를 재공개하는 짝.

## 핵심 발췌

```python
from app.schemas.common import *      # 공용 요소를 먼저 로드
from app.schemas.weekly import *
from app.schemas.inventory import *
from app.schemas.item import *
# ... 나머지 도메인 모듈
```
