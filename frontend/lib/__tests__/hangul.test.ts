import { describe, it, expect } from "vitest";
import { toChosung, toHangul, toQwerty } from "../hangul";

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

describe("두벌식 Shift 자모", () => {
  it("Shift 키 대문자를 Shift 자모로 조립", () => {
    expect(toHangul("P O R E Q T W")).toBe("ㅖ ㅒ ㄲ ㄸ ㅃ ㅆ ㅉ");
    expect(toHangul("rP")).toBe("계");
  });

  it("Shift 자모가 포함된 한글을 대문자 QWERTY로 역변환", () => {
    expect(toQwerty("ㅖㅒㄲㄸㅃㅆㅉ")).toBe("POREQTW");
    expect(toQwerty("계")).toBe("rP");
    expect(toHangul(toQwerty("계"))).toBe("계");
  });
});
