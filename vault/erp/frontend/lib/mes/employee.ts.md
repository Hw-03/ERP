---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/employee.ts
tags: [vault, code-note, b-tier]
---

# employee.ts — MES 직원(Employee) 유틸

> [!summary] 역할
> legacyUi.ts의 직원 순수 함수 정본 위치. firstEmployeeLetter() — 이름 첫 글자 추출(avatar용).

## 1. 이 파일의 역할
- firstEmployeeLetter(name?: string | null) — 이름 첫 글자 반환, 빈 입력은 "?"
- avatar 표기용 (1글자 배지)
- 네트워크/DB 의존 없음

## 2. 실제 원본 위치
`frontend/lib/mes/employee.ts` — 15줄

## 3. 주요 import
없음 (순수 함수)

## 4. 어디서 쓰이는지
- Employee 배지/카드 avatar 생성
- OperatorLoginCard 직원 선택 UI
- 부서 배정 화면

## 5. ⚠️ 위험 포인트
- **한글 첫 글자만 추출** — 영문이름도 slice(0, 1) 동일 (국제화 미처리)
- trim() 후 slice — 공백만 있는 입력은 "" 반환 후 "?"

## 6. 수정 전 체크
- firstEmployeeLetter("김현우") === "김" 확인
- firstEmployeeLetter(null) === "?" 확인
- firstEmployeeLetter("") === "?" 확인
