/**
 * 모델 식별자(items.model_symbol) → 표시명 매핑.
 *
 * 백엔드는 PF 의 model_symbol("3","4","6","7","8") 만 보내고,
 * 사용자 표시는 시리즈 베이스명을 사용한다.
 * 매핑에 없으면 fallback 으로 PF 이름 첫 토큰을 사용 — getModelLabel() 참고.
 */
const MODEL_DISPLAY_NAME: Record<string, string> = {
  "3": "DX3000",
  "4": "ADX4000W",
  "6": "ADX6000FB",
  "7": "COCOON",
  "8": "SOLO",
  "9": "신제품",
};

/**
 * model_symbol 우선, 없으면 pfName 의 첫 토큰("_" 앞).
 * 둘 다 비면 빈 문자열.
 */
export function getModelLabel(
  modelSymbol: string | null | undefined,
  pfName?: string | null,
): string {
  const ms = (modelSymbol ?? "").trim();
  if (ms && MODEL_DISPLAY_NAME[ms]) return MODEL_DISPLAY_NAME[ms];
  if (pfName) {
    const tok = pfName.split("_")[0]?.split(",")[0]?.trim();
    if (tok) return tok;
  }
  return ms || "";
}
