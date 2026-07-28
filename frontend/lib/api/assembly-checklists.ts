import { deleteJson, fetcher, postJson, putJson, toApiUrl } from "../api-core";
import type { AssemblyChecklist } from "./types/assembly-checklists";

export const assemblyChecklistsApi = {
  getAssemblyChecklists: () =>
    fetcher<AssemblyChecklist[]>(toApiUrl("/api/assembly-checklists")),

  createAssemblyChecklist: (payload: { model_slot: number }) =>
    postJson<AssemblyChecklist>(toApiUrl("/api/assembly-checklists"), payload),

  createAssemblyChecklistSection: (modelSlot: number, payload: { title: string }) =>
    postJson<AssemblyChecklist>(toApiUrl(`/api/assembly-checklists/${modelSlot}/sections`), payload),

  createAssemblyChecklistItem: (sectionId: string, payload: { content: string }) =>
    postJson<AssemblyChecklist>(toApiUrl(`/api/assembly-checklists/sections/${sectionId}/items`), payload),

  deleteAssemblyChecklistItem: (itemId: string) =>
    deleteJson<AssemblyChecklist>(toApiUrl(`/api/assembly-checklists/items/${itemId}`)),

  updateAssemblyChecklistItem: (itemId: string, payload: { content: string }) =>
    putJson<AssemblyChecklist>(toApiUrl(`/api/assembly-checklists/items/${itemId}`), payload),

  moveAssemblyChecklistItem: (
    itemId: string,
    payload: { target_section_id: string; target_index: number },
  ) => putJson<AssemblyChecklist>(toApiUrl(`/api/assembly-checklists/items/${itemId}/move`), payload),

  reorderAssemblyChecklistItems: (sectionId: string, payload: { item_ids: string[] }) =>
    putJson<AssemblyChecklist>(toApiUrl(`/api/assembly-checklists/sections/${sectionId}/items/reorder`), payload),
};
