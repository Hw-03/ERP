import { describe, it, expect } from "vitest";
import { toChosung } from "../hangul";

describe("toChosung", () => {
  it("완성형 음절을 초성 자모로 변환", () => {
    expect(toChosung("김건호")).toBe("ㄱㄱㅎ");
    expect(toChosung("이필욱")).toBe("ㅇㅍㅇ");
    expect(toChosung("남재원")).toBe("ㄴㅈㅇ");
  });

  it("받침(겹받침 포함)이 있어도 초성만 추출", () => {
    // 닭(ㄷ)·값(ㄱ) — 종성 무관하게 초성만.
    expect(toChosung("닭값")).toBe("ㄷㄱ");
  });

  it("호환 자모는 그대로 통과", () => {
    expect(toChosung("ㄱㄱㅎ")).toBe("ㄱㄱㅎ");
  });

  it("라틴/숫자/공백 등 비한글은 그대로 통과", () => {
    expect(toChosung("AB 12")).toBe("AB 12");
    expect(toChosung("김A호")).toBe("ㄱAㅎ");
  });

  it("빈 문자열은 빈 문자열", () => {
    expect(toChosung("")).toBe("");
  });
});
