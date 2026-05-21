---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/services/rate_limit.py
tags: [vault, code-note, b-tier]
---

# rate_limit.py — PIN 무차별 대입 방어 레이트 리미터

> [!summary] 역할
> 작업자 PIN 검증의 무차별 대입(brute-force) 공격 완화. 슬라이딩 윈도우 방식으로 일정 시간 내 실패 횟수 제한.

## 1. 이 파일의 역할
- 키별 실패 시도 시간 기록 (deque 사용 — O(1) 추가/제거)
- 슬라이딩 윈도우: 최근 window초 내 실패만 카운트
- is_blocked(key) 호출 전 차단 상태 확인, record_failure(key) 호출 후 기록
- 매 테스트마다 reset_all() 호출 (conftest autouse fixture)
- 프로세스 메모리만 사용 (재시작 시 초기화, 멀티 워커 간 공유 안 됨)

## 2. 실제 원본 위치
`backend/app/services/rate_limit.py` — 약 70줄

## 3. 주요 import
```python
import threading, time
from collections import deque
from typing import Deque, Dict
```
- threading.Lock으로 동시성 보호
- time.monotonic() 사용 (NTP 영향 없음)

## 4. 어디서 쓰이는지
- 라우터 `/api/employees/{id}/verify-pin` 엔드포인트에서 호출
- conftest.py의 autouse fixture에서 각 테스트 전 reset_all() 실행
- 기본값: max_failures=10, window_seconds=300 (5분 내 실패 10회 차단)

## 5. ⚠️ 위험 포인트
- **멀티 워커 시 각 워커가 독립적인 메모리** — 분산 배포 시 rate_limit 우회 가능. Redis 백엔드 필요.
- window 내에서 cutoff 이전 항목 제거 (popleft) — 정확한 윈도우 구현이지만 부하 고려
- is_blocked 후 실제 검증 사이 time of check/use 취약성 있음 (but 경량 MES라 수용)

## 6. 수정 전 체크
- reset_all() 호출 후 is_blocked(key) → False 확인
- max_failures=2, window_seconds=1 로 10회 시도 후 차단 확인
- 멀티 스레드 환경에서 race condition 없는지 (Lock 사용 확인)
