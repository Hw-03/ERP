---
layer: scripts
---

# a_file_mes_code_apply.py — A 파일에 MES 코드 추가 + DB 검증

> [!summary] A 파일 E(매칭품명) → 마스터 P(MES 코드) → A 새 F열. DB 정합성 점검

## 1. 역할
A 파일 열기(읽기전용 X). E열('매칭 확정 품명') → 마스터 K→P 매핑 → F열 입력. 메타 표기 행(괄호로 시작) 은 F 비움. DB(items) 대조.

## 2. 실제 원본 위치
erp/scripts/dev/a_file_mes_code_apply.py

## 3. 관련 형제 파일
- [[_kwon_match_v3.py.md|매칭 알고리즘]]
- [[rewrite_output_with_a_as_truth.py.md|A 기준 정본화]]
