export interface AssemblyChecklistItem {
  item_id: string;
  content: string;
  sort_order: number;
}

export interface AssemblyChecklistSection {
  section_id: string;
  title: string | null;
  sort_order: number;
  items: AssemblyChecklistItem[];
}

export interface AssemblyChecklist {
  checklist_id: string;
  model_slot: number;
  model_name: string;
  sections: AssemblyChecklistSection[];
}
