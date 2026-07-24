import { describe, expect, it } from "vitest";
import { matchesSearchText, normalizeSearchText } from "../searchText";

describe("normalizeSearchText", () => {
  it("lowercases and removes spaces, hyphens, dots, and slashes", () => {
    expect(normalizeSearchText(" 6-AF/01.2 ")).toBe("6af012");
  });

  it("preserves underscores, plus signs, and parentheses", () => {
    expect(normalizeSearchText("A_B+C(1)")).toBe("a_b+c(1)");
  });
});

describe("matchesSearchText", () => {
  it("matches regardless of spacing on either side", () => {
    expect(matchesSearchText("Alpha Beta", "alphabeta")).toBe(true);
    expect(matchesSearchText("AlphaBeta", "alpha beta")).toBe(true);
  });

  it("matches a code after ignored characters are removed", () => {
    expect(matchesSearchText("6-AF/01.2", "6AF012")).toBe(true);
  });

  it("matches without case sensitivity", () => {
    expect(matchesSearchText("MiXeD", "mixed")).toBe(true);
  });

  it("treats a query made only of ignored characters as empty", () => {
    expect(matchesSearchText("any value", " - / . \t")).toBe(true);
  });

  it("does not remove underscores, plus signs, or parentheses", () => {
    expect(matchesSearchText("A_B+C(1)", "ab+c(1)")).toBe(false);
    expect(matchesSearchText("A_B+C(1)", "a_b+c(1)")).toBe(true);
  });
});
