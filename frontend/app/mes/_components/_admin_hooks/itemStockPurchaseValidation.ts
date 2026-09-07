type StockPurchaseValues = {
  min_stock: string;
  reorder_point: string;
  procurement_lead_time_days: string;
  minimum_order_quantity: string;
  standard_purchase_price: string;
};

const INTEGER_FIELDS = [
  ["min_stock", 0, "안전재고는 0 이상 입력하세요."],
  ["reorder_point", 0, "발주점은 0 이상 입력하세요."],
  ["procurement_lead_time_days", 0, "조달 리드타임은 0 이상 입력하세요."],
  ["minimum_order_quantity", 1, "최소 발주수량(MOQ)은 1 이상 입력하세요."],
] as const;

const PURCHASE_PRICE_PATTERN = /^\d+(?:\.\d{1,2})?$/;

export function validateStockPurchaseValues(values: StockPurchaseValues): string | null {
  for (const [field, minimum, message] of INTEGER_FIELDS) {
    if (values[field] === "") continue;
    const numericValue = Number(values[field]);
    if (
      values[field].trim() === ""
      || !Number.isFinite(numericValue)
      || !Number.isInteger(numericValue)
      || numericValue < minimum
    ) {
      return message;
    }
  }

  const trimmedPrice = values.standard_purchase_price.trim();
  if (
    values.standard_purchase_price !== ""
    && (!trimmedPrice || !PURCHASE_PRICE_PATTERN.test(trimmedPrice))
  ) {
    return "기준 매입단가는 0 이상, 소수점 둘째 자리까지 입력하세요.";
  }
  return null;
}

export function normalizeStandardPurchasePrice(value: string): string {
  return value.trim();
}
