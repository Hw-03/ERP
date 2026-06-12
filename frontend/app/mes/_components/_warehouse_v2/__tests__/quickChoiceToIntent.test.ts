import { quickChoiceToIntent, inboundChoices, outboundChoices } from "../ioWorkType";

describe("quickChoiceToIntent", () => {
  it("dept_in → process 입고", () => {
    expect(quickChoiceToIntent("dept_in")).toEqual({ workType: "process", direction: "in" });
  });

  it("dept_out → process 출고", () => {
    expect(quickChoiceToIntent("dept_out")).toEqual({ workType: "process", direction: "out" });
  });

  it("wh_in → warehouse_io dept_to_warehouse", () => {
    expect(quickChoiceToIntent("wh_in")).toEqual({ workType: "warehouse_io", subType: "dept_to_warehouse" });
  });

  it("wh_out → warehouse_io warehouse_to_dept", () => {
    expect(quickChoiceToIntent("wh_out")).toEqual({ workType: "warehouse_io", subType: "warehouse_to_dept" });
  });

  it("receive → receive receive_supplier", () => {
    expect(quickChoiceToIntent("receive")).toEqual({ workType: "receive", subType: "receive_supplier" });
  });
});

describe("inboundChoices", () => {
  it("canReceive=false: 원자재 수령 제외", () => {
    const choices = inboundChoices(false);
    expect(choices.map((c) => c.key)).toEqual(["dept_in", "wh_in"]);
  });

  it("canReceive=true: 원자재 수령 포함", () => {
    const choices = inboundChoices(true);
    expect(choices.map((c) => c.key)).toEqual(["dept_in", "wh_in", "receive"]);
  });
});

describe("outboundChoices", () => {
  it("항상 2개 — dept_out, wh_out", () => {
    expect(outboundChoices.map((c) => c.key)).toEqual(["dept_out", "wh_out"]);
  });
});
