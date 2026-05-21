---
layer: scripts
---

# rewrite_output_with_a_as_truth.py — A 정본 기준으로 최종 산출물 갱신

> [!summary] A의 매칭값 → 26.05월_수정본 E/F 덮어쓰기. 메타 표기/미매칭은 회색

## 1. 역할
A 파일('F704-03__R00__자재_재고_현황_매칭품명추가.xlsx')을 정본으로 → 산출물(26.05월_수정본 시트) E/F 칼럼 갱신. (품명, 규격) 키로 매핑. 메타/신규 자재 회색 음영.

## 2. 실제 원본 위치
erp/scripts/dev/rewrite_output_with_a_as_truth.py

## 3. 관련 형제 파일
- [[a_file_mes_code_apply.py.md|MES 코드 추가]]
- [[kwon_match_apply.py.md|매칭 반영]]
