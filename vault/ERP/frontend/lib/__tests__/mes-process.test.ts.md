---
type: file-explanation
source_path: "frontend/lib/__tests__/mes-process.test.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# mes-process.test.ts — mes-process.test.ts 설명

## 이 파일은 무엇을 책임지나

`mes-process.test.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/__tests__/mes-process.test.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/frontend/lib/__tests__/📁___tests__]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```ts
import { describe, it, expect } from "vitest";
import {
  PROCESS_LABEL,
  PROCESS_TO_DEPT,
  processStageLabel,
  mesCodeDept,
  mesCodeDeptBadge,
  displayPart,
} from "../mes/process";

describe("processStageLabel", () => {
  it("returns Korean label for known stage codes", () => {
    expect(processStageLabel("TR")).toBe("Tube Raw");
    expect(processStageLabel("AA")).toBe("Assembly");
    expect(processStageLabel("PF")).toBe("Pack Final");
  });

  it("returns input as-is for unknown code", () => {
    expect(processStageLabel("XX")).toBe("XX");
  });

  it("returns '-' for empty / null / undefined", () => {
    expect(processStageLabel(undefined)).toBe("-");
    expect(processStageLabel(null)).toBe("-");
    expect(processStageLabel("")).toBe("-");
  });
});

describe("PROCESS_LABEL", () => {
  it("covers 18 stages (6 부서 × 3 단계)", () => {
    expect(Object.keys(PROCESS_LABEL).length).toBe(18);
  });
});

describe("mesCodeDept", () => {
  it("maps stage code 첫 글자 → 부서", () => {
    expect(mesCodeDept("ITM-TR-00001")).toBe("튜브");
    expect(mesCodeDept("ITM-HA-00010")).toBe("고압");
    expect(mesCodeDept("ITM-VF-00099")).toBe("진공");
    expect(mesCodeDept("ITM-NR-00001")).toBe("튜닝");
    expect(mesCodeDept("ITM-AA-00001")).toBe("조립");
    expect(mesCodeDept("ITM-PF-00001")).toBe("출하");
  });

  it("returns null for missing/short/unknown code", () => {
    expect(mesCodeDept(undefined)).toBeNull();
    expect(mesCodeDept(null)).toBeNull();
    expect(mesCodeDept("")).toBeNull();
    expect(mesCodeDept("ONLYONE")).toBeNull();
    expect(mesCodeDept("ITM-XX-00001")).toBeNull();
  });
});

describe("PROCESS_TO_DEPT", () => {
  it("covers 18 stage codes mapping to 6 부서", () => {
```
