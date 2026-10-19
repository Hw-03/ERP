import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AsResearchQueuePanel } from "../AsResearchQueuePanel";
import { DirtyGuardProvider } from "@/lib/ui/dirty-guard";
import { AccessRevocationGuard } from "../../common/AccessRevocationGuard";

function renderPanel(onChanged = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AsResearchQueuePanel approverEmployeeId="e1" refreshNonce={0} onChanged={onChanged} />
    </QueryClientProvider>,
  );
  return onChanged;
}

describe("AsResearchQueuePanel", () => {
  it("승인 권한 회수 시 반려 사유를 유지하고 이탈을 확인한다", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const leave = vi.fn();
    const tree = (allowed: boolean) => <QueryClientProvider client={client}><DirtyGuardProvider><AccessRevocationGuard allowed={allowed} onLeave={leave}><AsResearchQueuePanel approverEmployeeId="e1" refreshNonce={0} onChanged={vi.fn()} /></AccessRevocationGuard></DirtyGuardProvider></QueryClientProvider>;
    const view = render(tree(true));
    fireEvent.click(await screen.findByRole("button", { name: "반려" }));
    fireEvent.change(screen.getByPlaceholderText("반려 사유"), { target: { value: "작성 중인 사유" } });
    view.rerender(tree(false));
    expect(leave).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("반려 사유")).toHaveValue("작성 중인 사유");
    view.unmount(); client.clear();
  });
  it("AS·연구 승인에 PIN을 포함해 전용 endpoint를 호출한 뒤 목록 갱신을 알린다", async () => {
    const onChanged = renderPanel();

    await screen.findByRole("button", { name: "승인" });
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    fireEvent.change(screen.getByPlaceholderText("0000"), { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: "승인 확정" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
  });

  it("반려에는 네 자리 PIN과 사유를 모두 요구한다", async () => {
    renderPanel();

    await screen.findByRole("button", { name: "반려" });
    fireEvent.click(screen.getByRole("button", { name: "반려" }));
    fireEvent.click(screen.getByRole("button", { name: "반려 확정" }));

    expect(screen.getByText("PIN과 반려 사유를 모두 입력해 주세요.")).toBeInTheDocument();
  });
});
