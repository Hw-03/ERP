---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/tokens.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# tokens.ts — tokens.ts 설명

## 이 파일은 무엇을 책임지나

`tokens.ts`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `TYPO`
- `ELEVATION`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/📁_mobile]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
export const TYPO = {
  overline: "text-xs font-bold uppercase tracking-wider",
  headline: "text-lg font-black leading-tight",
  title: "text-base font-bold",
  body: "text-sm font-medium",
  caption: "text-xs font-regular",
  display: "text-2xl font-black",
};

export const ELEVATION = {
  sticky: "0 2px 8px rgba(0,0,0,0.12)",
};
```
