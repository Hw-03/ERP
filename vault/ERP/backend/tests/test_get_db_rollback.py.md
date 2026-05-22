---
type: file-explanation
source_path: "backend/tests/test_get_db_rollback.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_get_db_rollback.py — test_get_db_rollback.py 설명

## 이 파일은 무엇을 책임지나

`test_get_db_rollback.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `test_get_db_rolls_back_and_closes_on_exception`
- `test_get_db_no_rollback_on_normal_completion`

## 연결되는 파일

- [[ERP/backend/tests/📁_tests]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""WS4 회귀: get_db() 가 핸들러 예외 시 세션을 롤백한 뒤 close 하는지 검증.

미롤백이면 풀드 PostgreSQL 경로에서 aborted-transaction 커넥션이 풀로 반환돼
다음 요청을 오염시킨다. PG 풀 재현 없이 제너레이터 계약을 직접 검증한다.
"""
from unittest.mock import MagicMock, patch

from app import database


def test_get_db_rolls_back_and_closes_on_exception():
    fake = MagicMock()
    order = MagicMock()
    order.attach_mock(fake.rollback, "rollback")
    order.attach_mock(fake.close, "close")
    with patch.object(database, "SessionLocal", return_value=fake):
        gen = database.get_db()
        assert next(gen) is fake
        try:
            gen.throw(RuntimeError("handler boom"))
        except RuntimeError:
            pass
        fake.rollback.assert_called_once()
        fake.close.assert_called_once()
        # rollback 은 반드시 close 이전 (오염 커넥션 풀 반환 방지의 핵심).
        assert [c[0] for c in order.mock_calls] == ["rollback", "close"]


def test_get_db_no_rollback_on_normal_completion():
    fake = MagicMock()
    with patch.object(database, "SessionLocal", return_value=fake):
        gen = database.get_db()
        next(gen)
        try:
            next(gen)  # 정상 종료 → StopIteration
        except StopIteration:
            pass
        fake.rollback.assert_not_called()
        fake.close.assert_called_once()
```
