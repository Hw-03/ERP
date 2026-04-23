---
type: code-note
project: ERP
layer: frontend
source_path: frontend/tsconfig.json
status: active
tags:
  - erp
  - frontend
  - typescript
  - config
aliases:
  - TypeScript 설정
---

# tsconfig.json

> [!summary] 역할
> TypeScript 컴파일러 옵션을 정의하는 설정 파일.

> [!info] 핵심 설정
> | 옵션 | 값 | 설명 |
> |------|-----|------|
> | `strict` | true | 엄격 타입 검사 활성화 |
> | `moduleResolution` | bundler | Next.js 15 번들러 모드 |
> | `paths` | `@/*` → `"./*"` | `@/` 절대경로 별칭 설정 |
> | `jsx` | preserve | JSX 보존 (Next.js가 처리) |
> | `exclude` | node_modules, _archive | 컴파일 제외 폴더 |

> [!info] 경로 별칭
> `@/*` 별칭 덕분에 `@/lib/api`, `@/components/AppHeader` 같은 절대경로 import가 가능하다.

---

## 쉬운 말로 설명

**TypeScript 가 코드를 어떻게 검사·변환할지 정의하는 설정**. 특히 `paths` 의 `@/*` → `./*` 덕분에 `import from "@/lib/api"` 같은 짧은 경로가 가능.

Next.js 는 `tsconfig.json` 을 자동으로 인식하므로 별도 설정 전파 불필요.

## FAQ

**Q. `strict: true` 때문에 빌드 에러?**
타입 안전성 보장. 임시로 풀려면 `"strict": false` 또는 개별 옵션(`noImplicitAny: false`). 가능하면 유지.

**Q. `@/*` 를 `@/src/*` 로 바꾸려면?**
`paths` + `baseUrl` 수정. Next.js 는 즉시 반영.

---

## 관련 문서

- [[frontend/package.json.md]] — 의존성 목록
- [[frontend/next.config.js.md]] — Next 설정

Up: [[frontend/frontend]]
