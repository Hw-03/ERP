// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { clearDefectEntryUrl, defectEntryHistory, defectEntryUrl, readDefectDepartment, readDefectEntry } from "../defect-entry";

describe("불량 재고 진입 계약", () => {
  it.each(["/", "/mes"])("%s 경로와 세 대상 조건을 보존한다", (path) => {
    const target = { itemId: "item", department: "튜브", managementCategory: "DEFECT" as const };
    const url = new URL(defectEntryUrl(path, target), "http://localhost");
    expect(url.pathname).toBe(path);
    expect(readDefectEntry(url.search)).toEqual(target);
  });
  it.each(["?tab=defect&defect_dept=튜브&defect_category=INVALID&defect_item_id=a", "?tab=defect&defect_item_id=a", "?tab=dashboard&defect_item_id=a&defect_dept=튜브&defect_category=DEFECT", "?tab=defect&defect_item_id=%20&defect_dept=튜브&defect_category=B_GRADE"])("불완전한 진입은 일반 화면으로 처리한다: %s", (query) => {
    expect(readDefectEntry(query)).toBeNull();
    expect(readDefectDepartment(query)).toBeNull();
  });
  it("구형 부서 링크는 유지한다", () => expect(readDefectDepartment("?tab=defect&defect_dept=튜브")).toBe("튜브"));
  it("이력의 프레임워크·모바일 필드를 유지하며 허브 복귀는 이력을 추가하지 않는다", () => {
    const target = { itemId: "item", department: "튜브", managementCategory: "OBSOLETE" as const };
    window.history.replaceState(defectEntryHistory({ __NA: true, mobileShippingIndex: 3 }, target), "", defectEntryUrl("/mes", target));
    const before = history.length;
    expect(history.state).toMatchObject({ __NA: true, mobileShippingIndex: 3, defect: "storage" });
    clearDefectEntryUrl();
    expect(history.length).toBe(before);
    expect(history.state).toMatchObject({ __NA: true, mobileShippingIndex: 3, defect: "hub" });
    expect(window.location.search).toBe("?tab=defect");
  });
});
