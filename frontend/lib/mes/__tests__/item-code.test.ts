import { describe, expect, it } from "vitest";
import {
  modelSlotsToSymbolPrefix,
  sortModelsBySymbol,
} from "../item-code";

const MODELS = [
  { slot: 4, symbol: "4", model_name: "ADX4000W", is_reserved: false },
  { slot: 3, symbol: "8", model_name: "SOLO", is_reserved: false },
  { slot: 1, symbol: "3", model_name: "DX3000", is_reserved: false },
];

describe("item-code", () => {
  it("슬롯과 표시 순서가 달라도 제품기호 오름차순으로 모델을 정렬한다", () => {
    expect(sortModelsBySymbol(MODELS).map((model) => model.symbol)).toEqual(["3", "4", "8"]);
  });

  it("선택 슬롯을 제품기호 오름차순 접두어로 변환한다", () => {
    expect(modelSlotsToSymbolPrefix([1, 3, 4], MODELS)).toBe("348");
  });
});
