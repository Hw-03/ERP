import type { Item } from "@/lib/api";
import { matchesSearchText } from "@/lib/searchText";

// 품목 검색 공용 헬퍼.
// 김건호 피드백 5·6 반영:
//  5) 무공백 매칭 — haystack·keyword 양쪽의 모든 공백을 제거한 뒤 비교해
//     "방사구너트" 가 "방사구 너트" 를 매칭한다(소문자화는 유지).
//  6) 정밀도 — 검색 대상 필드를 item_name·mes_code 두 가지로 좁힌다.
//     (legacy_part·location·supplier 는 무관 품목 혼입을 유발해 제외.)

/** item_name·mes_code만 대상으로 공백·하이픈·점·슬래시를 무시해 비교한다. */
export function matchesItemSearch(item: Item, keyword: string): boolean {
  return matchesSearchText([item.item_name, item.mes_code ?? ""].join(" "), keyword);
}
