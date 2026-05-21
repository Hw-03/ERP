---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/colorUtils.ts
tags: [vault, code-note, b-tier]
---

# colorUtils.ts — color-mix CSS 함수 헬퍼

> [!summary] 역할
> tint() 함수로 `color-mix(in srgb, ...)` 인라인 패턴 감소. 기본값 transparent 지원.

## 1. 이 파일의 역할
- tint(color: string, pct: number, base?: string) — 색상 + 비율 → CSS color-mix 문자열 생성
- pct: 0-100 (정수 권장), base: 기본값 "transparent"
- 반환: `"color-mix(in srgb, #ff0000 30%, transparent)"`

## 2. 실제 원본 위치
`frontend/lib/mes/colorUtils.ts` — 9줄

## 3. 주요 import
없음 (순수 함수)

## 4. 어디서 쓰이는지
- UI 컴포넌트의 inline style에서 색상 투명도 조정
- 예: `style={{ background: tint(LEGACY_COLORS.red, 20) }}`
- Badge/Pill 호버/활성 상태 표현

## 5. ⚠️ 위험 포인트
- **color-mix 브라우저 지원** — Safari/Chrome 최신 버전만 지원 (폴백 스타일 필수)
- pct 정수 권장 — 부동소수(30.5%) 입력 시 브라우저 파싱 실패 가능
- base 생략 시 "transparent" — 다른 배경색 위에 쌓일 때 예상과 다를 수 있음

## 6. 수정 전 체크
- tint("#ff0000", 50) === `"color-mix(in srgb, #ff0000 50%, transparent)"` 확인
- tint("#0000ff", 30, "white") === `"color-mix(in srgb, #0000ff 30%, white)"` 확인
- 브라우저 개발자 도구에서 color-mix 렌더링 결과 시각화 확인
