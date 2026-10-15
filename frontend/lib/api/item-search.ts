import { ApiError } from "../api-core";
import { restoreOperatorSession } from "../auth/operator-session";
import { requestOperatorLogin } from "../auth/login-recovery";
import { requestJson } from "./stocktake";
import type { ItemSearchAlias, ItemSearchConfig, ItemSearchSynonymGroup } from "./types/item-search";

const ROOT = "/api/item-search";
/** Always use the credential owned by this document, including login recovery. */
function operatorToken(): string {
  const token = restoreOperatorSession()?.token;
  if (token) return token;
  requestOperatorLogin();
  throw new ApiError("작업자 인증을 다시 진행해 주세요.", 401, "OPERATOR_SESSION_INVALID");
}
async function write<T>(path: string, method: string, payload?: object): Promise<T> {
  return requestJson<T>(`${ROOT}${path}`, operatorToken(), {
    method, headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}
export const itemSearchApi = {
  getConfig(): Promise<ItemSearchConfig> { return requestJson(`${ROOT}/config`, null, { cache: "no-store" }); },
  addAlias(itemId: string, alias: string): Promise<ItemSearchAlias> { return write(`/items/${encodeURIComponent(itemId)}/aliases`, "POST", { alias }); },
  deleteAlias(itemId: string, aliasId: string): Promise<void> { return write(`/items/${encodeURIComponent(itemId)}/aliases/${encodeURIComponent(aliasId)}`, "DELETE"); },
  addGroup(terms: string[]): Promise<ItemSearchSynonymGroup> { return write("/synonym-groups", "POST", { terms }); },
  updateGroup(id: string, terms: string[], expectedVersion: number): Promise<ItemSearchSynonymGroup> {
    return write(`/synonym-groups/${encodeURIComponent(id)}`, "PUT", { terms, expected_version: expectedVersion });
  },
  deleteGroup(id: string, expectedVersion: number): Promise<void> {
    return write(`/synonym-groups/${encodeURIComponent(id)}?expected_version=${expectedVersion}`, "DELETE");
  },
};
