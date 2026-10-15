export interface ItemSearchAlias { alias_id: string; alias: string }
export interface ItemSearchSynonymGroup { group_id: string; version: number; terms: string[] }
export interface ItemSearchConfig {
  version: string;
  synonym_groups: ItemSearchSynonymGroup[];
  item_aliases: Record<string, ItemSearchAlias[]>;
}
export const EMPTY_ITEM_SEARCH_CONFIG: ItemSearchConfig = { version: "", synonym_groups: [], item_aliases: {} };
