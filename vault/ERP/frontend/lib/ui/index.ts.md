---
type: file-explanation
source_path: "frontend/lib/ui/index.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# index.ts — index.ts 설명

## 이 파일은 무엇을 책임지나

`index.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/ui/index.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `ToastState`
- `ConfirmTone`

## 연결되는 파일

- [[ERP/frontend/lib/ui/📁_ui]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```ts
/**
 * Shared UI components — `@/lib/ui`.
 *
 * Round-14 (#1): cross-feature 공용 컴포넌트 (modal/sheet/toast) 를
 * `features/mes/shared` 에서 `lib/ui` 로 이동.
 */
export { Toast, type ToastState } from "./Toast";
export { ConfirmModal, type ConfirmTone } from "./ConfirmModal";
export { BottomSheet } from "./BottomSheet";
export { Tooltip } from "./Tooltip";
export { TruncatedText } from "./TruncatedText";
```
