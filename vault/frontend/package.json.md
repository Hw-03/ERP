---
type: code-note
project: ERP
layer: frontend
source_path: frontend/package.json
status: active
tags:
  - erp
  - frontend
  - infra
aliases:
  - 프론트엔드 패키지
---

# package.json

> [!summary] 역할
> 프론트엔드 프로젝트의 패키지 설정 파일. 의존성, 스크립트, 프레임워크 버전이 여기 정의된다.

> [!info] 주요 내용
> - **프레임워크**: Next.js 15 (App Router)
> - **언어**: TypeScript
> - **스타일**: Tailwind CSS
> - **주요 스크립트**:
>   - `npm run dev` — 개발 서버 실행 (포트 3000)
>   - `npm run build` — 프로덕션 빌드
>   - `npm start` — 빌드 결과 실행

---

## 쉬운 말로 설명

**프론트엔드 프로젝트의 "이름표"**. 어떤 라이브러리를 쓰는지, 어떻게 실행하는지 정의. npm/pnpm 이 이걸 보고 의존성 설치 + 스크립트 실행.

## 주요 의존성 예

| 패키지 | 용도 |
|--------|------|
| `next` | Next.js 프레임워크 |
| `react` / `react-dom` | UI 렌더링 |
| `typescript` | 타입 시스템 |
| `tailwindcss` | 스타일 |
| `lucide-react` | 아이콘 (Moon/Sun/Barcode 등) |

## FAQ

**Q. 버전 업그레이드 순서?**
`package.json` 수정 → `npm install` → `npm run build` + `npm run dev` 로 검증. Next 15 → 16 같은 메이저 버전은 changelog 필독.

**Q. `package-lock.json` 커밋?**
YES. 팀 간 정확히 같은 버전 보장.

**Q. 의존성 제거?**
`npm uninstall <pkg>`. `package.json` 직접 수정 후 `npm install` 도 가능.

---

## 관련 문서

- [[frontend/tsconfig.json.md]]
- [[frontend/next.config.js.md]]
- [[frontend/Dockerfile.md]]

Up: [[frontend/frontend]]
