import type { Item } from "@/lib/api";

// 품목 검색 공용 헬퍼.
// 김건호 피드백 5·6 반영:
//  5) 무공백 매칭 — haystack·keyword 양쪽의 모든 공백을 제거한 뒤 비교해
//     "방사구너트" 가 "방사구 너트" 를 매칭한다(소문자화는 유지).
//  6) 정밀도 — 검색 대상 필드를 item_name·mes_code 두 가지로 좁힌다.
//     (legacy_part·location·supplier 는 무관 품목 혼입을 유발해 제외.)

/** 소문자화 + 모든 공백 제거. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

/** item_name·mes_code 만 합쳐 무공백·소문자 비교한다. keyword 는 이미 소문자/trim 되어 있어도 무방(멱등). */
export function matchesItemSearch(item: Item, keyword: string): boolean {
  if (!keyword) return true;
  const needle = normalize(keyword);
  if (!needle) return true;
  const haystack = normalize([item.item_name, item.mes_code ?? ""].join(" "));
  return haystack.includes(needle);
}
