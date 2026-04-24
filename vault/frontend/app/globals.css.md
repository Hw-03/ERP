---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/globals.css
status: active
tags:
  - erp
  - frontend
  - styles
  - theme
  - css
aliases:
  - 글로벌 CSS
---

# globals.css

> [!summary] 역할
> 전체 앱에 적용되는 **CSS 변수(테마 팔레트)와 Tailwind 기본 설정**을 정의하는 파일.
> 다크/라이트 모드 전환의 핵심으로, 모든 컴포넌트가 이 변수를 참조한다.

> [!info] CSS 변수 체계 (다크 모드 기본)
> | 변수 | 설명 | 기본값 |
> |------|------|--------|
> | `--c-bg` | 최외곽 배경 | `#07101d` (매우 진한 네이비) |
> | `--c-s1` ~ `--c-s4` | 레이어별 배경 (밝아지는 순) | 반투명 네이비 |
> | `--c-border` | 테두리 기본 | 연한 하늘색 12% |
> | `--c-blue` | 주 강조색 | `#65a9ff` |
> | `--c-green` | 성공/정상 | `#43d39d` |
> | `--c-red` | 위험/오류 | `#ff7b7b` |
> | `--c-yellow` | 경고 | `#f6c667` |
> | `--c-purple` | 보조 강조 | `#8e7dff` |
> | `--c-cyan` | 보조 강조 2 | `#4ec9f5` |

> [!info] 라이트 모드
> `[data-theme="light"]` 선택자로 CSS 변수를 흰 배경 계열로 오버라이드.
> `ThemeToggle` 컴포넌트가 `data-theme` 속성을 토글한다.

---

## 쉬운 말로 설명

**테마 팔레트 본체**. CSS 변수(`--c-bg`, `--c-blue` 등)를 한 번 정의하면 앱 전체 컴포넌트가 이 값을 참조. 테마 바뀔 때 변수값만 바뀌므로 UI 수정 없이 전체 색상 교체.

동작:
1. `:root` 에 다크 모드 값 정의 (기본)
2. `[data-theme="light"]` 로 라이트 모드 오버라이드
3. `ThemeToggle` 이 `document.documentElement.dataset.theme` 를 `"light"` / 제거
4. 브라우저가 자동으로 관련 변수 재해석 → 전체 리페인트

## 예시: 값 참조

```tsx
// TypeScript 상수 (legacyUi.ts)
const LEGACY_COLORS = {
  bg: "var(--c-bg)",      // 다크: #07101d, 라이트: #ffffff
  blue: "var(--c-blue)",  // 다크: #65a9ff, 라이트: #2962ff (예시)
};

// 사용
<div style={{ background: LEGACY_COLORS.bg }}>
```

## FAQ

**Q. Tailwind 와의 관계?**
Tailwind 클래스(`bg-slate-950` 등)와 CSS 변수(`var(--c-bg)`)를 혼용. 레거시 UI 는 변수 중심, 새 UI 는 Tailwind 중심.

**Q. 라이트 모드에서 색상 어색함?**
라이트 모드 팔레트 매핑이 완벽하지 않은 곳이 남아있음. 수정 시 이 파일 `[data-theme="light"]` 블록에서 해당 변수값 조정.

**Q. 시스템 다크모드 자동 감지?**
현재는 안 함. `@media (prefers-color-scheme: dark)` 블록 추가하면 가능. 단 `ThemeToggle` 과 충돌 방지 로직 필요.

---

## 관련 문서

- [[frontend/app/legacy/_components/legacyUi.ts.md]] — CSS 변수를 TypeScript 상수로 매핑
- [[frontend/app/legacy/_components/ThemeToggle.tsx.md]] — 테마 전환 컴포넌트
- [[frontend/tailwind.config.ts.md]] — Tailwind 설정

Up: [[frontend/app/app]]
