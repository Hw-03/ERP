import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientErrorReporter } from "../ClientErrorReporter";
import ErrorBoundary from "../error";
import GlobalError from "../global-error";
import { installClientErrorListeners, reportClientError } from "@/lib/client-events";

vi.mock("@/lib/client-events", () => ({ installClientErrorListeners: vi.fn(), reportClientError: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("global client error integration", () => {
  it("installs listeners on mount and removes them on unmount without rendering UI", () => {
    const remove = vi.fn();
    vi.mocked(installClientErrorListeners).mockReturnValue(remove);
    const view = render(<ClientErrorReporter />);
    expect(installClientErrorListeners).toHaveBeenCalledTimes(1);
    expect(view.container).toBeEmptyDOMElement();
    view.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("reports route errors using the shared diagnostic helper", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("route render failure");
    render(<ErrorBoundary error={error} reset={vi.fn()} />);
    expect(reportClientError).toHaveBeenCalledWith(error, "react_boundary");
  });

  it("reports layout errors even when the root reporter cannot mount", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("layout render failure");
    render(<GlobalError error={error} reset={vi.fn()} />);
    expect(reportClientError).toHaveBeenCalledWith(error, "global_boundary");
  });
});
