/* eslint-disable @next/next/no-img-element */
import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MesLoginGate } from "../MesLoginGate";

vi.mock("next/image", () => ({
  default: ({ alt = "", ...props }: Record<string, unknown>) => <img alt={String(alt)} {...props} />,
}));

vi.mock("../OperatorLoginCard", () => ({
  OperatorLoginCard: () => null,
}));

vi.mock("../useCurrentOperator", () => ({
  clearCurrentOperator: vi.fn(),
  getStoredBootId: vi.fn(),
  readCurrentOperator: () => null,
}));

interface MatchMediaOptions {
  narrow?: boolean;
  reducedMotion?: boolean;
}

function installMatchMedia({ narrow = false, reducedMotion = false }: MatchMediaOptions = {}) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string): MediaQueryList => ({
      matches: query === "(max-width: 1023px)" ? narrow : reducedMotion,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  });
}

function renderLoginGate() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MesLoginGate>
        <div>Authenticated content</div>
      </MesLoginGate>
    </QueryClientProvider>,
  );
}

function getMascotImages(container: HTMLElement): NodeListOf<HTMLImageElement> {
  return container.querySelectorAll('img[src*="dexray-pointing-left.webp"]');
}

describe("MesLoginGate mascot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installMatchMedia();
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("shows one decorative desktop mascot on the right only after the intro reaches the form", () => {
    const { container } = renderLoginGate();

    expect(getMascotImages(container)).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(1100);
    });

    const images = getMascotImages(container);
    expect(images).toHaveLength(1);

    const mascot = images[0];
    const decoration = mascot.closest('[aria-hidden="true"]');

    expect(mascot).toHaveAttribute("alt", "");
    expect(mascot).toHaveAttribute("width", "607");
    expect(mascot).toHaveAttribute("height", "640");
    expect(decoration).toHaveClass("pointer-events-none", "hidden", "lg:block");
    expect(decoration).toHaveStyle({
      left: "calc(50% + clamp(200px, 13vw, 260px))",
      bottom: "clamp(120px, 25vh, 228px)",
      width: "clamp(260px, min(18vw, 40vh), 380px)",
    });
  });

  it("shows the mascot immediately with the form when reduced motion is preferred", () => {
    installMatchMedia({ reducedMotion: true });

    const { container } = renderLoginGate();

    expect(getMascotImages(container)).toHaveLength(1);
  });

  it("renders the mascot on the employee server", () => {
    vi.stubEnv("NEXT_PUBLIC_MES_ENV", "employee");
    installMatchMedia({ reducedMotion: true });

    const { container } = renderLoginGate();

    expect(getMascotImages(container)).toHaveLength(1);
  });
});
