import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-core", () => ({
  deleteJson: vi.fn(),
  fetcher: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
  toApiUrl: (path: string) => path,
}));

import { deleteJson, putJson } from "@/lib/api-core";
import { assemblyChecklistsApi } from "../assembly-checklists";

describe("assemblyChecklistsApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("체크리스트 항목 내용을 수정한다", async () => {
    vi.mocked(putJson).mockResolvedValueOnce({} as never);

    await assemblyChecklistsApi.updateAssemblyChecklistItem("item-1", { content: "수정" });

    expect(putJson).toHaveBeenCalledWith("/api/assembly-checklists/items/item-1", { content: "수정" });
  });

  it("체크리스트 항목을 다른 섹션으로 이동한다", async () => {
    vi.mocked(putJson).mockResolvedValueOnce({} as never);
    const payload = { target_section_id: "section-2", target_index: 1 };

    await assemblyChecklistsApi.moveAssemblyChecklistItem("item-1", payload);

    expect(putJson).toHaveBeenCalledWith("/api/assembly-checklists/items/item-1/move", payload);
  });

  it("체크리스트 박스 이름과 순서를 저장한다", async () => {
    vi.mocked(putJson).mockResolvedValue({} as never);

    await assemblyChecklistsApi.updateAssemblyChecklistSection("section-1", { title: "전원 ON" });
    await assemblyChecklistsApi.reorderAssemblyChecklistSections(1, { section_ids: ["section-2", "section-1"] });

    expect(putJson).toHaveBeenNthCalledWith(
      1,
      "/api/assembly-checklists/sections/section-1",
      { title: "전원 ON" },
    );
    expect(putJson).toHaveBeenNthCalledWith(
      2,
      "/api/assembly-checklists/1/sections/reorder",
      { section_ids: ["section-2", "section-1"] },
    );
  });

  it("체크리스트 박스를 삭제한다", async () => {
    vi.mocked(deleteJson).mockResolvedValueOnce({} as never);

    await assemblyChecklistsApi.deleteAssemblyChecklistSection("section-1");

    expect(deleteJson).toHaveBeenCalledWith("/api/assembly-checklists/sections/section-1");
  });
});
