"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assemblyChecklistsApi } from "@/lib/api/assembly-checklists";
import type { AssemblyChecklist } from "@/lib/api/types/assembly-checklists";
import { STALE_TIME } from "./client";
import { queryKeys } from "./keys";

function applyLatestChecklist(
  current: AssemblyChecklist[] | undefined,
  latest: AssemblyChecklist,
): AssemblyChecklist[] {
  const existing = current ?? [];
  const index = existing.findIndex((checklist) => checklist.model_slot === latest.model_slot);
  if (index < 0) return [...existing, latest];
  return existing.map((checklist, checklistIndex) => (checklistIndex === index ? latest : checklist));
}

function useLatestChecklistMutation<T>(mutationFn: (payload: T) => Promise<AssemblyChecklist>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (latest) => {
      queryClient.setQueryData<AssemblyChecklist[]>(queryKeys.assemblyChecklists.list(), (current) =>
        applyLatestChecklist(current, latest),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.assemblyChecklists.all });
    },
  });
}

export function useAssemblyChecklistsQuery() {
  return useQuery({
    queryKey: queryKeys.assemblyChecklists.list(),
    queryFn: assemblyChecklistsApi.getAssemblyChecklists,
    staleTime: STALE_TIME.MASTER,
  });
}

export function useCreateAssemblyChecklistMutation() {
  return useLatestChecklistMutation(({ modelSlot }: { modelSlot: number }) =>
    assemblyChecklistsApi.createAssemblyChecklist({ model_slot: modelSlot }),
  );
}

export function useCreateAssemblyChecklistSectionMutation() {
  return useLatestChecklistMutation(({ modelSlot, title }: { modelSlot: number; title: string }) =>
    assemblyChecklistsApi.createAssemblyChecklistSection(modelSlot, { title }),
  );
}

export function useCreateAssemblyChecklistItemMutation() {
  return useLatestChecklistMutation(({ sectionId, content }: { sectionId: string; content: string }) =>
    assemblyChecklistsApi.createAssemblyChecklistItem(sectionId, { content }),
  );
}

export function useDeleteAssemblyChecklistItemMutation() {
  return useLatestChecklistMutation(({ itemId }: { itemId: string }) =>
    assemblyChecklistsApi.deleteAssemblyChecklistItem(itemId),
  );
}

export function useReorderAssemblyChecklistItemsMutation() {
  return useLatestChecklistMutation(({ sectionId, itemIds }: { sectionId: string; itemIds: string[] }) =>
    assemblyChecklistsApi.reorderAssemblyChecklistItems(sectionId, { item_ids: itemIds }),
  );
}
