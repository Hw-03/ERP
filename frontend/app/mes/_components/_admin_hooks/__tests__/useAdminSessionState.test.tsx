import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { AdminSessionProvider, useAdminScrollRestoration, useAdminSessionState } from "../useAdminSessionState";

function View() {
  const [search, setSearch] = useAdminSessionState<string>("items.search", "");
  return <input aria-label="search" value={search} onChange={(event) => setSearch(event.target.value)} />;
}

function Session() {
  const [visible, setVisible] = useState(true);
  return <AdminSessionProvider><button onClick={() => setVisible(!visible)}>toggle</button>{visible && <View />}</AdminSessionProvider>;
}

function ScrollView() {
  const [key, setKey] = useState("first");
  const viewport = useRef<HTMLDivElement>(null);
  useAdminScrollRestoration(key, viewport, true);
  return <><button onClick={() => setKey(key === "first" ? "second" : "first")}>switch</button><div ref={viewport} data-testid="viewport" /></>;
}

describe("admin session preferences", () => {
  it("restores each result scroll independently and starts new selections at the top", () => {
    render(<AdminSessionProvider><ScrollView /></AdminSessionProvider>);
    const viewport = screen.getByTestId("viewport");
    viewport.scrollTop = 300;
    fireEvent.scroll(viewport);
    fireEvent.click(screen.getByText("switch"));
    expect(viewport.scrollTop).toBe(0);
    viewport.scrollTop = 120;
    fireEvent.scroll(viewport);
    fireEvent.click(screen.getByText("switch"));
    expect(viewport.scrollTop).toBe(300);
  });
  it("restores a remounted view and clears preferences when the admin session ends", () => {
    const first = render(<Session />);
    fireEvent.change(screen.getByLabelText("search"), { target: { value: "tube" } });
    fireEvent.click(screen.getByText("toggle"));
    fireEvent.click(screen.getByText("toggle"));
    expect(screen.getByLabelText("search")).toHaveValue("tube");
    first.unmount();
    render(<Session />);
    expect(screen.getByLabelText("search")).toHaveValue("");
  });
});
