---
type: index
project: ERP
layer: frontend
status: active
tags:
  - erp
  - frontend
aliases:
  - 프론트엔드 폴더
---

# frontend

> [!summary] 역할
> Next.js 15 App Router 기반의 프론트엔드 웹 앱.
> 재고 조회, 입출고, 생산, BOM, 관리자 기능의 UI를 제공한다.

> [!warning] 주의
> - 루트 `page.tsx`는 실제 구현이 없고, `legacy/page.tsx`로 리다이렉트한다.
> - **실제 활성 UI**는 `app/legacy/` 폴더의 컴포넌트들이다.
> - `app/inventory/`, `app/bom/` 등의 page.tsx는 일부 준비 중인 새 UI일 수 있음.

## 하위 문서

- [[frontend/app/app]] — 라우트 페이지들
- [[frontend/app/legacy/legacy]] — 현재 활성 UI (핵심!)
- [[frontend/app/legacy/_components/_components]] — 화면 컴포넌트
- [[frontend/lib/lib]] — API 클라이언트
- [[frontend/components/components]] — 공용 컴포넌트
- [[frontend/package.json.md]] — 패키지 설정
- [[frontend/Dockerfile.md]] — 프론트엔드 Docker 빌드
- [[frontend/next.config.js.md]] — Next.js 빌드 설정 (API 프록시)
- [[frontend/tailwind.config.ts.md]] — Tailwind CSS 설정
- [[frontend/tsconfig.json.md]] — TypeScript 설정
- [[frontend/postcss.config.js.md]] — PostCSS 설정
- [[frontend/app/globals.css.md]] — CSS 변수 테마 정의

## 실행 방법

```bash
cd frontend
npm run dev
```

접속: http://localhost:3000

---

## 쉬운 말로 설명

Frontend는 이 ERP의 **"얼굴"**. 사용자가 실제로 보고 만지는 웹 화면 전체. 버튼 클릭 → 백엔드 API 호출 → 응답으로 화면 갱신.

### 기술 스택 한줄 설명
- **Next.js 15** — React 기반의 웹 프레임워크. 페이지 자동 라우팅.
- **App Router** — URL 경로가 폴더 구조를 따름 (`app/legacy/page.tsx` → `/legacy`).
- **TypeScript** — 타입이 있는 자바스크립트. 실수 줄임.
- **Tailwind CSS** — 유틸리티 클래스 방식의 스타일링 (`className="flex items-center"` 같은 식).

---

## ⚠️ 가장 중요한 포인트

**`app/legacy/` 가 진짜 UI다.** 이름이 legacy지만 "구버전"이 아니라 **현재 실서비스**. 다른 `app/inventory`, `app/bom` 같은 폴더는 일부 미완성이거나 새 UI 전환 작업의 흔적. **수정할 때 반드시 `legacy/` 쪽을 먼저 확인**.

---

## 폴더 역할

| 폴더 | 역할 |
|------|------|
| `app/` | Next.js 라우트 페이지 (URL별 page.tsx) |
| `app/legacy/` ⭐ | 실제 활성 UI |
| `app/legacy/_components/` | 화면 컴포넌트 19개 |
| `lib/` | API 호출 함수 (`api.ts`) |
| `components/` | 공용 컴포넌트 (`AppHeader` 등) |

---

## 핵심 용어 (자세한 건 용어 사전)

- **컴포넌트(component)** — 화면의 조각. 재사용 가능한 UI 블록.
- **상태(state)** — 컴포넌트가 기억하는 값. `useState` 로 만든다.
- **props** — 부모가 자식 컴포넌트에 넘겨주는 값.
- **API 클라이언트** — 백엔드와 통신하는 코드. 이 프로젝트에선 `lib/api.ts` 하나.

---

## FAQ

**Q. 새 화면 추가하려면?**
- 기존 UI 수정이면 `app/legacy/_components/` 에 컴포넌트 만들고 `DesktopLegacyShell` 또는 `LegacyLayout` 에 연결.
- 새 URL 추가면 `app/새경로/page.tsx` 만들고 `api.ts` 와 연결.

**Q. 다크/라이트 테마는?**
[[frontend/app/legacy/_components/ThemeToggle.tsx.md]] 참고. CSS 변수로 색 교체.

**Q. 모바일에서 자동으로 화면 바뀌나?**
Tailwind `lg:` 미디어쿼리로 분기. 큰 화면은 `DesktopLegacyShell`, 작은 화면은 탭 기반 `LegacyLayout`.

---

## 관련 문서

- [[frontend/app/app]]
- [[frontend/app/legacy/legacy]] ⭐
- [[frontend/lib/api.ts.md]] ⭐ — 백엔드 통신
- [[backend/backend]] — 이 프론트가 호출하는 API 서버
- 품목 등록 시나리오, 재고 입출고 시나리오

Up: ERP MOC
