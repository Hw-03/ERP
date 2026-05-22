---
type: folder-note
source_path: "frontend/app"
importance: important
layer: frontend
graph: hub
updated: 2026-05-22
project: DEXCOWIN MES
---

# 📁 app

## 이 폴더는 무엇을 위한 곳인가

Next.js App Router의 진입 폴더입니다. 실제 활성 화면은 대부분 legacy 하위에서 실행됩니다.

## 현장 업무와의 관계

브라우저 첫 접속이 어디 화면으로 들어가는지 결정합니다.

## 언제 보면 좋나

- 처음 접속 화면, 에러 화면, 라우팅 구조를 확인할 때
- 모바일/데스크톱 진입을 볼 때

## 주요 하위 폴더

- [[ERP/frontend/app/legacy/📁_legacy]] — 현재 운영 중인 실제 MES 화면입니다. 이름은 legacy지만 지금 사용자가 보는 핵심 UI입니다.

## 먼저 볼 파일 5개

- [[ERP/frontend/app/error.tsx]] — `error.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/app/error.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/frontend/app/global-error.tsx]] — `global-error.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/app/global-error.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/frontend/app/globals.css]] — `globals.css`는 스타일시트입니다. 프로젝트 구조 안에서 `frontend/app/globals.css` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/frontend/app/layout.tsx]] — `layout.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/app/layout.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/frontend/app/page.tsx]] — `page.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/app/page.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 조심할 점

page.tsx와 layout.tsx를 잘못 바꾸면 전체 접속 경로가 흔들립니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/frontend/📁_frontend]]
