---
type: folder-note
source_path: "frontend/app/legacy/_components/login"
importance: normal
layer: frontend
graph: hub
updated: 2026-05-22
project: DEXCOWIN MES
---

# 📁 login

## 이 폴더는 무엇을 위한 곳인가

`frontend/app/legacy/_components/login`는 프론트엔드 화면이나 공용 로직의 세부 폴더입니다.

## 현장 업무와의 관계

사용자가 보는 화면이나 화면이 서버와 통신하는 방식에 연결됩니다.

## 언제 보면 좋나

- 이 폴더 안의 파일이 어떤 역할인지 빠르게 파악할 때
- 수정 전에 먼저 읽을 파일을 고를 때

## 먼저 볼 파일 5개

- [[ERP/frontend/app/legacy/_components/login/MesLoginGate.tsx]] — 사용자가 시스템에 들어오기 전에 담당자를 선택하고 PIN 인증을 거치게 하는 화면 흐름입니다.
- [[ERP/frontend/app/legacy/_components/login/EmployeeCombobox.tsx]] — `EmployeeCombobox.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/app/legacy/_components/login/OperatorLoginCard.tsx]] — `OperatorLoginCard.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/app/legacy/_components/login/useCurrentOperator.ts]] — `useCurrentOperator.ts`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/app/legacy/_components/login/useLoginEmployees.ts]] — `useLoginEmployees.ts`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 조심할 점

폴더 성격을 먼저 확인하고 현재 운영 코드인지, 보관 자료인지, 자동 생성물인지 구분해야 합니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/frontend/app/legacy/_components/📁__components]]
