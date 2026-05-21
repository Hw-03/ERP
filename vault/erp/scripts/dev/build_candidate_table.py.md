---
type: code-note
project: DEXCOWIN MES
layer: scripts
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/scripts/dev/build_candidate_table.py
tags: [vault, code-note, b-tier]
---

# build_candidate_table.py — 연녹/없음/연파랑 후보 보조표 생성

> [!summary] 역할
> 권동환 직원의 재고 정리본 Excel에서 색상 기반 후보 필터링. SQLite 품목과 매칭해 판단 테이블 생성.

## 1. 이 파일의 역할
- _attic/data/0520 권동환 사원님 재고 디렉토리 기준 파일 읽기
- fc() — Excel 셀 배경색 RGB 추출 (None/None 처리)
- tokens() — 텍스트 → 2글자 이상 부분 단어 set 추출
- score() — token 교집합 비율 (Jaccard)로 텍스트 유사도 계산
- target_rows 분류: GREEN/NONE/BLUE (색상 기반)
- 출력: 판단필요_후보표_20260521.xlsx

## 2. 실제 원본 위치
`scripts/dev/build_candidate_table.py` — 약 100줄

## 3. 주요 import
```python
import openpyxl, re, sqlite3
from openpyxl.styles import PatternFill, Font, Alignment
from openpyxl.utils import get_column_letter
from pathlib import Path
```

## 4. 어디서 쓰이는지
- 일회성 데이터 정리 (2026-05-20 시점)
- 재고 매칭 작업 결과 검증
- _attic 보관 (현재는 운영 필요 없음)

## 5. ⚠️ 위험 포인트
- **하드코딩된 파일 경로** — _attic/ 구조 변경 시 작동 안 함
- fc() — try/except로 RGB 추출 시도하지만 예외 무시 (색상 미정의)
- score() — token 비율은 텍스트 매칭용, 수치 정확도는 낮음

## 6. 수정 전 체크
- Excel 파일 존재 확인
- fc() 색상 추출 동작 확인 (None 처리)
- score() 계산 일부 테스트 (tokens 집합 차집합 유무)
