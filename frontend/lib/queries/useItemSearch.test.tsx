// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { SearchConfigProvider, useItemSearch } from "./useItemSearch";
import { itemSearchApi } from "../api/item-search";
import { queryKeys } from "./keys";
import { act } from "@testing-library/react";
import { SearchConfigStatus } from "@/app/mes/_components/common/SearchConfigStatus";
vi.mock("../api/item-search", () => ({ itemSearchApi: { getConfig: vi.fn() } }));
function Value() { const { config, ready, error, retry } = useItemSearch(); return <><output>{config.version}:{String(ready)}:{error}</output><button onClick={retry}>재시도</button></>; }
describe("검색 설정", () => {
  it("공통 안내는 사전 조회 실패와 재시도를 모든 화면에 표시한다", async () => {
    vi.mocked(itemSearchApi.getConfig).mockRejectedValue(new Error("연결 실패"));
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SearchConfigProvider><SearchConfigStatus floating /></SearchConfigProvider></QueryClientProvider>);
    expect(await screen.findByText(/연결 실패/)).toBeVisible();
    expect(screen.getByRole("alert")).toHaveClass("fixed");
    expect(screen.getByRole("button", { name: "검색 설정 재시도" })).toBeVisible();
  });
  it("메타데이터만 갱신되어도 matcher는 새 별칭을 참조한다", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(itemSearchApi.getConfig).mockResolvedValue({ version: "v1", synonym_groups: [], item_aliases: {} });
    function Result() { const { matchesItem } = useItemSearch(); return <output>{String(matchesItem({ item_id: "i", item_name: "구동부" }, "전동기"))}</output>; }
    render(<QueryClientProvider client={client}><SearchConfigProvider><Result /></SearchConfigProvider></QueryClientProvider>);
    await waitFor(() => expect(itemSearchApi.getConfig).toHaveBeenCalled());
    expect(screen.getByRole("status")).toHaveTextContent("false");
    act(() => client.setQueryData(queryKeys.itemSearch.config(), { version: "v2", synonym_groups: [], item_aliases: { i: [{ alias_id: "a", alias: "전동기" }] } }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("true"));
  });
  it("provider 없는 기존 화면에서도 기본 검색을 유지한다", () => { render(<Value />); expect(screen.getByRole("status")).toHaveTextContent(":true:"); });
  it("조회 실패를 노출하고 재시도로 최신 설정을 읽는다", async () => {
    vi.mocked(itemSearchApi.getConfig).mockRejectedValueOnce(new Error("조회 실패")).mockResolvedValue({ version: "v2", synonym_groups: [], item_aliases: {} });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SearchConfigProvider><Value /></SearchConfigProvider></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("조회 실패"));
    fireEvent.click(screen.getByRole("button", { name: "재시도" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("v2:true:"));
  });
});
