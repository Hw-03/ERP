---
type: file-explanation
source_path: "backend/app/models/__init__.py"
importance: important
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# __init__.py — 모델 표를 한곳으로 모아 재공개(re-export)

## 이 파일은 무엇을 책임지나

도메인별로 쪼개진 모델 파일(item, inventory, employee …)에 흩어진 표와 Enum 을 한 자리에 다시 내보내(re-export) 줍니다. 덕분에 다른 코드는 `from app.models import Item` 한 줄로 모든 표를 예전처럼 불러올 수 있습니다.

## 업무 흐름에서의 의미

직접 화면에 나오는 코드는 아니지만, "파일만 쪼개고 호출하는 쪽 코드는 안 바꾼다" 를 가능하게 하는 다리입니다. 예전 단일 `models.py` 시절의 import 경로를 그대로 보존합니다.

## 언제 보면 좋나

- 어떤 표/Enum 이 `app.models` 에서 바로 불러와지는지 한눈에 볼 때
- 새 모델 파일을 추가했는데 import 가 안 될 때(여기 등록이 빠졌는지 확인)

## 중요한 내용

- 각 도메인 파일에서 표·Enum 을 import 한 뒤 `__all__` 로 공개 목록을 정의합니다.
- 새 모델을 추가하면 이 파일의 import 와 `__all__` 에도 등록해야 `from app.models import X` 가 동작합니다.

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/📁_models]] — 모델 패키지 전체 개요.

## 핵심 발췌

```python
from app.models.item import BOM, Item
from app.models.inventory import Inventory, InventoryLocation, LocationStatusEnum
# ... 각 도메인 파일에서 re-export
__all__ = ["Item", "BOM", "Inventory", ...]
```
