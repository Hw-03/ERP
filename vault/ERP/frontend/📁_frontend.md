---
type: folder-note
source_path: "frontend"
importance: important
layer: frontend
graph: hub
updated: 2026-05-22
project: DEXCOWIN MES
---

# 📁 frontend

## 이 폴더는 무엇을 위한 곳인가

Next.js 프론트엔드입니다. 현장 직원과 관리자가 실제로 보는 화면이 들어 있습니다.

## 현장 업무와의 관계

대시보드, 입출고, 입출고 내역, 관리자 화면, 모바일 화면이 여기서 구성됩니다.

## 언제 보면 좋나

- 화면 문구나 버튼 위치를 바꿀 때
- 현장 사용 흐름을 개선할 때
- API 호출이 어디서 일어나는지 찾을 때

## 주요 하위 폴더

- [[ERP/frontend/app/📁_app]] — Next.js App Router의 진입 폴더입니다. 실제 활성 화면은 대부분 mes 하위에서 실행됩니다.
- [[ERP/frontend/app/mes/_components/📁__components]] — `frontend/components`는 프론트엔드 화면이나 공용 로직의 세부 폴더입니다.
- [[ERP/frontend/app/mes/_components/📁__components]] — `frontend/features`는 프론트엔드 화면이나 공용 로직의 세부 폴더입니다.
- [[ERP/frontend/lib/📁_lib]] — 프론트 화면이 공통으로 쓰는 API 호출, 포맷, 상태/색상 규칙, UI 보조 로직입니다.
- [[ERP/frontend/public/📁_public]] — `frontend/public`는 프론트엔드 화면이나 공용 로직의 세부 폴더입니다.
- [[ERP/frontend/scripts/📁_scripts]] — `frontend/scripts`는 프론트엔드 화면이나 공용 로직의 세부 폴더입니다.

## 먼저 볼 파일 5개

- [[ERP/frontend/.dockerignore]] — `.dockerignore`는 Git/도구 설정입니다. 프로젝트 구조 안에서 `frontend/.dockerignore` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/frontend/.eslintrc.json]] — `.eslintrc.json`는 JSON 설정/데이터입니다. 프로젝트 구조 안에서 `frontend/.eslintrc.json` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/frontend/.gitignore]] — `.gitignore`는 Git/도구 설정입니다. 프로젝트 구조 안에서 `frontend/.gitignore` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/frontend/next-env.d.ts]] — `next-env.d.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/next-env.d.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/frontend/next.config.js]] — `next.config.js`는 JavaScript 설정/코드입니다. 프로젝트 구조 안에서 `frontend/next.config.js` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

> [!info]- 추가 파일
> - [[ERP/frontend/package-lock.json]] — package-lock.json
> - [[ERP/frontend/package.json]] — package.json
> - [[ERP/frontend/postcss.config.js]] — postcss.config.js
> - [[ERP/frontend/tailwind.config.ts]] — tailwind.config.ts
> - [[ERP/frontend/tsconfig.json]] — tsconfig.json
> - [[ERP/frontend/vitest.setup.ts]] — vitest.setup.ts

## 조심할 점

현재 실제 데스크톱 화면은 app/mes 쪽이 중심입니다. 이름만 보고 mes라 버리면 안 됩니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/📁_ERP]]
