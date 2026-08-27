import { describe, expect, it } from "vitest";
import type { RequestBucket, StockRequestLine } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import {
  getRequestQuantityPresentation,
  getRequestStatusPresentation,
} from "../ioRequestLabels";

function quantityLine(
  fromBucket: RequestBucket,
  toBucket: RequestBucket,
  quantity = 12,
): Pick<StockRequestLine, "quantity" | "from_bucket" | "to_bucket"> {
  return {
    quantity,
    from_bucket: fromBucket,
    to_bucket: toBucket,
  };
}

describe("getRequestStatusPresentation", () => {
  it.each(["submitted", "reserved"])(
    "%s 상태를 같은 승인 대기 표현으로 반환",
    (status) => {
      expect(getRequestStatusPresentation(status)).toEqual({
        label: "승인 대기",
        color: LEGACY_COLORS.yellow,
      });
    },
  );

  it("다른 상태의 기존 의미를 유지", () => {
    expect(getRequestStatusPresentation("completed")).toEqual({
      label: "완료",
      color: LEGACY_COLORS.green,
    });
    expect(getRequestStatusPresentation("unknown")).toEqual({
      label: "unknown",
      color: LEGACY_COLORS.muted2,
    });
  });
});

describe("getRequestQuantityPresentation", () => {
  it("외부에서 재고로 들어오는 요청을 양수로 표시", () => {
    expect(getRequestQuantityPresentation(quantityLine("none", "warehouse"))).toEqual({
      text: "+12개",
      tone: "positive",
    });
  });

  it("재고에서 외부로 나가는 요청을 음수로 표시", () => {
    expect(getRequestQuantityPresentation(quantityLine("production", "none"))).toEqual({
      text: "-12개",
      tone: "negative",
    });
  });

  it("재고 사이 요청을 이동 수량으로 표시", () => {
    expect(getRequestQuantityPresentation(quantityLine("warehouse", "production"))).toEqual({
      text: "이동 12개",
      tone: "movement",
    });
  });

  it("레거시 none 간 요청은 부호 없이 표시", () => {
    expect(getRequestQuantityPresentation(quantityLine("none", "none"))).toEqual({
      text: "12개",
      tone: "neutral",
    });
  });

  it("기존 수량 포맷의 정수 표시 정책을 유지", () => {
    expect(getRequestQuantityPresentation(quantityLine("none", "production", 1.25))).toEqual({
      text: "+1개",
      tone: "positive",
    });
  });
});
