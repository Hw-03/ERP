import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
} from "obsidian";

interface GraphSizePatcherSettings {
  enabled: boolean;
  minRadius: number;
  maxRadius: number;
  scaleFactor: number;
  includeExtensions: string;
  patchIntervalMs: number;
}

const DEFAULT_SETTINGS: GraphSizePatcherSettings = {
  enabled: false,
  minRadius: 8,
  maxRadius: 48,
  scaleFactor: 4,
  includeExtensions: ".md,.canvas",
  patchIntervalMs: 0,
};

const ERP_COLOR_GROUPS = [
  { query: "path:ERP.md", color: { a: 1, rgb: 0x8b5cf6 } },
  { query: "path:_vault", color: { a: 1, rgb: 0xf5a623 } },
  { query: "path:backend/app/routers", color: { a: 1, rgb: 0x42a5f5 } },
  { query: "path:backend/app/services", color: { a: 1, rgb: 0x1e88e5 } },
  { query: "path:backend", color: { a: 1, rgb: 0x1565c0 } },
  { query: "path:frontend/app/legacy", color: { a: 1, rgb: 0xe4572e } },
  { query: "path:frontend", color: { a: 1, rgb: 0x8d3e3e } },
  { query: "path:docs", color: { a: 1, rgb: 0x00897b } },
  { query: "path:scripts", color: { a: 1, rgb: 0x43a047 } },
  { query: "path:data", color: { a: 1, rgb: 0xf39c12 } },
];

type UnknownRecord = Record<string, any>;

export default class ErpGraphSizePatcherPlugin extends Plugin {
  settings: GraphSizePatcherSettings;
  private patchTimer: number | null = null;
  private scheduleTimer: number | null = null;
  private patchedObjects = new Set<object>();
  private originals = new WeakMap<object, Record<string, any>>();
  private originalGetSizes = new WeakMap<object, { value: any; hadOwn: boolean }>();
  private lastNoticeAt = 0;

  async onload() {
    await this.loadSettings();
    await this.ensureGraphColorGroups();
    this.addSettingTab(new ErpGraphSizePatcherSettingTab(this.app, this));

    this.addCommand({
      id: "apply-graph-size-patch-now",
      name: "Apply graph size patch now",
      callback: () => this.applyOnce(),
    });

    this.addCommand({
      id: "toggle-graph-size-patcher",
      name: "Toggle graph size patcher",
      callback: async () => {
        this.settings.enabled = !this.settings.enabled;
        await this.saveSettings();
        if (this.settings.enabled) {
          new Notice("ERP Graph Size Patcher enabled");
          this.startPatchLoop();
          this.schedulePatch();
        } else {
          this.stopPatchLoop();
          this.unpatchAllGraphViews();
          new Notice("ERP Graph Size Patcher disabled");
        }
      },
    });

    this.addCommand({
      id: "restore-built-in-graph-sizes",
      name: "Restore built-in graph sizes now",
      callback: () => this.unpatchAllGraphViews(true),
    });

    this.registerEvent(this.app.workspace.on("layout-change", () => this.schedulePatch()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.schedulePatch()));
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.enabled) {
        this.startPatchLoop();
        this.schedulePatch();
      }
    });
  }

  onunload() {
    this.stopPatchLoop();
    if (this.scheduleTimer !== null) {
      window.clearTimeout(this.scheduleTimer);
      this.scheduleTimer = null;
    }
    this.restorePatchedObjects();
  }

  async loadSettings() {
    const loaded = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings = {
      ...loaded,
      minRadius: DEFAULT_SETTINGS.minRadius,
      maxRadius: DEFAULT_SETTINGS.maxRadius,
      scaleFactor: DEFAULT_SETTINGS.scaleFactor,
      includeExtensions: DEFAULT_SETTINGS.includeExtensions,
      patchIntervalMs: 0,
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private async ensureGraphColorGroups() {
    const configPath = ".obsidian/graph.json";
    try {
      const adapter = this.app.vault.adapter;
      const exists = await adapter.exists(configPath);
      if (!exists) return;

      const raw = await adapter.read(configPath);
      const graph = raw ? JSON.parse(raw) : {};
      let changed = false;

      if (graph.search === "48") {
        graph.search = "";
        changed = true;
      }

      if (!Array.isArray(graph.colorGroups)) {
        graph.colorGroups = [];
        changed = true;
      }

      for (const desired of ERP_COLOR_GROUPS) {
        const existing = graph.colorGroups.find((group: UnknownRecord) => group?.query === desired.query);
        if (!existing) {
          graph.colorGroups.push({
            query: desired.query,
            color: { ...desired.color },
          });
          changed = true;
          continue;
        }

        const color = existing.color || {};
        if (color.a !== desired.color.a || color.rgb !== desired.color.rgb) {
          existing.color = { ...desired.color };
          changed = true;
        }
      }

      if (graph["collapse-color-groups"] !== false) {
        graph["collapse-color-groups"] = false;
        changed = true;
      }

      if (changed) {
        await adapter.write(configPath, `${JSON.stringify(graph, null, 2)}\n`);
      }
    } catch (error) {
      console.warn("[ERP Graph Size Patcher] Failed to restore graph color groups.", error);
    }
  }

  reloadPatchLoop() {
    this.stopPatchLoop();
    this.startPatchLoop();
    this.schedulePatch();
  }

  private startPatchLoop() {
    if (!this.settings.enabled || this.patchTimer !== null) return;
    if (!this.settings.patchIntervalMs) return;
    this.patchTimer = window.setInterval(
      () => this.patchAllGraphViews(false),
      Math.max(250, this.settings.patchIntervalMs || DEFAULT_SETTINGS.patchIntervalMs),
    );
    this.registerInterval(this.patchTimer);
  }

  private stopPatchLoop() {
    if (this.patchTimer !== null) {
      window.clearInterval(this.patchTimer);
      this.patchTimer = null;
    }
  }

  private schedulePatch() {
    if (!this.settings.enabled) return;
    if (this.scheduleTimer !== null) window.clearTimeout(this.scheduleTimer);
    this.scheduleTimer = window.setTimeout(() => {
      this.scheduleTimer = null;
      void this.ensureGraphColorGroups();
      this.patchAllGraphViews(false);
    }, 250);
  }

  private patchAllGraphViews(showNotice: boolean) {
    if (!this.settings.enabled) return;
    void this.ensureGraphColorGroups();

    const sizeIndex = this.buildSizeIndex();
    let graphViews = 0;
    let patchedNodes = 0;

    this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      const view = leaf.view as any;
      if (!view || typeof view.getViewType !== "function") return;
      if (view.getViewType() !== "graph") return;

      graphViews += 1;
      try {
        patchedNodes += this.patchGraphView(view, sizeIndex);
      } catch (error) {
        console.warn("[ERP Graph Size Patcher] Failed to patch graph view.", error);
        this.throttledNotice("ERP Graph Size Patcher: graph patch failed; default graph kept.");
      }
    });

    if (showNotice) {
      new Notice(`ERP Graph Size Patcher: ${patchedNodes} node(s) patched in ${graphViews} graph view(s).`);
    } else if (graphViews > 0 && patchedNodes === 0) {
      console.warn("[ERP Graph Size Patcher] Graph view found, but no node collection matched.");
    }
  }

  private applyOnce() {
    const previousEnabled = this.settings.enabled;
    this.settings.enabled = true;
    try {
      this.patchAllGraphViews(true);
    } finally {
      this.settings.enabled = previousEnabled;
    }
  }

  private unpatchAllGraphViews(showNotice = false) {
    this.restorePatchedObjects();
    this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      const view = leaf.view as any;
      if (!view || typeof view.getViewType !== "function" || view.getViewType() !== "graph") return;
      this.requestGraphRefresh(view);
      for (const renderer of this.findRendererCandidates(view)) this.requestGraphRefresh(renderer);
    });
    if (showNotice) new Notice("ERP Graph Size Patcher: built-in graph sizes restored.");
  }

  private patchGraphView(view: UnknownRecord, sizeIndex: Map<string, number>): number {
    const renderers = this.findRendererCandidates(view);
    const collections = this.findNodeCollections(view, sizeIndex);
    const patched = new Set<object>();

    for (const renderer of renderers) {
      this.patchGraphRenderer(renderer, sizeIndex, patched);
    }

    for (const collection of collections) {
      for (const item of collection) {
        const radius = this.lookupRadius(item.node, item.key, sizeIndex);
        if (radius === null) continue;
        try {
          if (this.patchGraphNode(item.node, radius)) patched.add(item.node);
        } catch (error) {
          console.debug("[ERP Graph Size Patcher] Skipped a read-only graph node.", error);
        }
      }
    }

    this.requestGraphRefresh(view);
    for (const renderer of renderers) this.requestGraphRefresh(renderer);
    return patched.size;
  }

  private findRendererCandidates(view: UnknownRecord): UnknownRecord[] {
    const found = new Set<UnknownRecord>();

    const add = (value: any) => {
      if (this.isGraphRendererCandidate(value)) found.add(value);
    };

    for (const key of ["renderer", "graphRenderer", "graph", "engine"]) {
      try {
        add(view[key]);
      } catch {
        // Ignore throwing getters on internal view objects.
      }
    }

    const visited = new WeakSet<object>();
    const stack: Array<{ value: any; depth: number }> = [{ value: view, depth: 0 }];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) break;
      const value = current.value;
      if (!this.isTraversable(value) || visited.has(value)) continue;
      visited.add(value);

      add(value);
      if (current.depth >= 3) continue;

      for (const key of this.safePropertyNames(value)) {
        if (this.shouldSkipProperty(key)) continue;
        try {
          const next = value[key];
          if (this.isTraversable(next)) stack.push({ value: next, depth: current.depth + 1 });
        } catch {
          // Keep scanning other graph internals.
        }
      }
    }

    return Array.from(found);
  }

  private isGraphRendererCandidate(value: any): value is UnknownRecord {
    if (!this.isPlainObjectLike(value)) return false;
    const hasNodes = Boolean(value.nodeLookup || value.nodes || value.nodeList);
    const canRender = ["changed", "queueRender", "setData", "render"].some((key) => typeof value[key] === "function");
    return hasNodes && canRender;
  }

  private patchGraphRenderer(renderer: UnknownRecord, sizeIndex: Map<string, number>, patched: Set<object>) {
    const sources = [
      renderer.nodeLookup,
      renderer.nodes,
      renderer.nodeList,
      renderer.graph?.nodeLookup,
      renderer.graph?.nodes,
    ];

    for (const source of sources) {
      if (!source) continue;
      for (const item of this.asNodeCollection(source, sizeIndex)) {
        const radius = this.lookupRadius(item.node, item.key, sizeIndex);
        if (radius === null) continue;
        if (this.patchGraphNode(item.node, radius)) patched.add(item.node);
      }
    }
  }

  private patchGraphNode(node: UnknownRecord, radius: number): boolean {
    if (typeof node.getSize !== "function" && !this.originalGetSizes.has(node)) return false;
    const sizeChanged = this.patchGetSize(node, radius);

    if (sizeChanged) {
      try {
        node.fontDirty = true;
      } catch {
        // Best-effort hint for Obsidian's graph text renderer.
      }
    }

    return true;
  }

  private patchGetSize(node: UnknownRecord, radius: number): boolean {
    const previous = node.__erpGraphSizeRadius;
    const hadOwn = Object.prototype.hasOwnProperty.call(node, "getSize");
    const original = node.getSize;

    if (typeof original !== "function" && !this.originalGetSizes.has(node)) return previous !== radius;

    if (!this.originalGetSizes.has(node)) {
      this.originalGetSizes.set(node, { value: original, hadOwn });
      this.patchedObjects.add(node);
    }

    const originalEntry = this.originalGetSizes.get(node);
    const fallback = originalEntry?.value;

    try {
      Object.defineProperty(node, "__erpGraphSizeRadius", {
        value: radius,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(node, "getSize", {
        configurable: true,
        writable: true,
        value: function patchedErpGraphNodeSize(this: UnknownRecord) {
          const patchedRadius = this.__erpGraphSizeRadius;
          if (typeof patchedRadius === "number" && Number.isFinite(patchedRadius)) return patchedRadius;
          return typeof fallback === "function" ? fallback.call(this) : radius;
        },
      });
    } catch {
      try {
        node.__erpGraphSizeRadius = radius;
        node.getSize = function patchedErpGraphNodeSize(this: UnknownRecord) {
          const patchedRadius = this.__erpGraphSizeRadius;
          if (typeof patchedRadius === "number" && Number.isFinite(patchedRadius)) return patchedRadius;
          return typeof fallback === "function" ? fallback.call(this) : radius;
        };
      } catch {
        return false;
      }
    }

    return previous !== radius;
  }

  private buildSizeIndex(): Map<string, number> {
    const includedExtensions = this.getIncludedExtensions();
    const includedFiles = this.app.vault
      .getFiles()
      .filter((file) => !file.path.startsWith(".obsidian/"))
      .filter((file) => includedExtensions.has(`.${file.extension.toLowerCase()}`));

    const folderCounts = new Map<string, number>();
    folderCounts.set("", includedFiles.length);
    for (const file of includedFiles) {
      const parts = file.path.split("/");
      for (let i = 1; i < parts.length; i += 1) {
        const folder = parts.slice(0, i).join("/");
        folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);
      }
    }

    const sizeIndex = new Map<string, number>();
    for (const file of includedFiles) {
      const folder = this.getRepresentedFolder(file);
      const descendantCount = folder !== null ? folderCounts.get(folder) || 0 : 0;
      const radius = descendantCount > 0
        ? this.radiusForCount(descendantCount)
        : this.settings.minRadius;

      for (const alias of this.aliasesForFile(file, folder)) {
        this.setMaxSize(sizeIndex, alias, radius);
      }
    }

    return sizeIndex;
  }

  private getIncludedExtensions(): Set<string> {
    const raw = this.settings.includeExtensions || DEFAULT_SETTINGS.includeExtensions;
    const values = raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
      .map((value) => value.startsWith(".") ? value : `.${value}`);
    return new Set(values.length ? values : [".md", ".canvas"]);
  }

  private radiusForCount(count: number): number {
    const raw = this.settings.minRadius + Math.sqrt(Math.max(0, count)) * this.settings.scaleFactor;
    return Math.max(this.settings.minRadius, Math.min(this.settings.maxRadius, raw));
  }

  private getRepresentedFolder(file: TFile): string | null {
    const parent = file.parent?.path || "";
    const basename = file.basename;
    if (!parent || parent === "/") {
      if (["ERP", "_ERP", "ERP-Vault", "_ERP-Vault"].includes(basename)) return "";
      return null;
    }
    const folderName = parent.split("/").pop() || "";
    if (basename === folderName || basename === `_${folderName}`) return parent;
    return null;
  }

  private aliasesForFile(file: TFile, representedFolder: string | null): string[] {
    const aliases = new Set<string>();
    const pathNoMd = file.path.endsWith(".md") ? file.path.slice(0, -3) : file.path;
    const nameNoMd = file.name.endsWith(".md") ? file.name.slice(0, -3) : file.name;

    aliases.add(file.path);
    aliases.add(pathNoMd);
    aliases.add(file.name);
    aliases.add(nameNoMd);
    aliases.add(file.basename);

    const leafName = file.basename.includes(".")
      ? file.basename.split(".").slice(0, -1).join(".")
      : file.basename;
    if (leafName) aliases.add(leafName);

    if (representedFolder !== null) {
      const folderName = representedFolder
        ? representedFolder.split("/").pop() || representedFolder
        : file.basename;
      if (representedFolder) aliases.add(representedFolder);
      aliases.add(folderName);
      aliases.add(`_${folderName}`);
      if (!representedFolder) {
        aliases.add("/");
        aliases.add("root");
      }
    }

    return Array.from(aliases).map((alias) => this.normalizeKey(alias));
  }

  private setMaxSize(map: Map<string, number>, key: string, radius: number) {
    const current = map.get(key);
    if (current === undefined || radius > current) map.set(key, radius);
  }

  private normalizeKey(value: string): string {
    return String(value)
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .trim()
      .toLowerCase();
  }

  private findNodeCollections(view: UnknownRecord, sizeIndex: Map<string, number>): Array<Array<{ node: UnknownRecord; key?: string }>> {
    const collections: Array<Array<{ node: UnknownRecord; key?: string }>> = [];
    const visited = new WeakSet<object>();
    const stack: Array<{ value: any; depth: number }> = [{ value: view, depth: 0 }];
    let inspected = 0;

    while (stack.length > 0 && inspected < 2500) {
      const current = stack.pop();
      if (!current) break;
      const value = current.value;
      if (!this.isTraversable(value) || visited.has(value)) continue;
      visited.add(value);
      inspected += 1;

      const collection = this.asNodeCollection(value, sizeIndex);
      if (collection.length > 0) collections.push(collection);

      if (current.depth >= 6) continue;
      for (const key of this.safePropertyNames(value)) {
        if (this.shouldSkipProperty(key)) continue;
        try {
          const next = value[key];
          if (this.isTraversable(next)) stack.push({ value: next, depth: current.depth + 1 });
        } catch {
          // Some internal graph properties are getters that may throw.
        }
      }
    }

    return collections;
  }

  private asNodeCollection(value: any, sizeIndex: Map<string, number>): Array<{ node: UnknownRecord; key?: string }> {
    const result: Array<{ node: UnknownRecord; key?: string }> = [];

    if (value instanceof Map) {
      for (const [key, node] of value.entries()) {
        if (this.isPatchableNodeCandidate(node) && this.lookupRadius(node, String(key), sizeIndex) !== null) {
          result.push({ node, key: String(key) });
        }
      }
      return result.length > 0 ? result : [];
    }

    if (value instanceof Set) {
      for (const node of value.values()) {
        if (this.isPatchableNodeCandidate(node) && this.lookupRadius(node, undefined, sizeIndex) !== null) {
          result.push({ node });
        }
      }
      return result.length > 0 ? result : [];
    }

    if (Array.isArray(value)) {
      for (const node of value) {
        if (this.isPatchableNodeCandidate(node) && this.lookupRadius(node, undefined, sizeIndex) !== null) {
          result.push({ node });
        }
      }
      return result.length > 0 ? result : [];
    }

    if (this.isPlainObjectLike(value)) {
      for (const key of Object.keys(value)) {
        const node = value[key];
        if (this.isPatchableNodeCandidate(node) && this.lookupRadius(node, key, sizeIndex) !== null) {
          result.push({ node, key });
        }
      }
      return result.length > 0 ? result : [];
    }

    return [];
  }

  private lookupRadius(node: any, rawKey: string | undefined, sizeIndex: Map<string, number>): number | null {
    if (!node || typeof node !== "object") return null;
    const candidates = this.nodeKeyCandidates(node, rawKey);
    for (const candidate of candidates) {
      const normalized = this.normalizeKey(candidate);
      const direct = sizeIndex.get(normalized);
      if (direct !== undefined) return direct;
      if (normalized.endsWith(".md")) {
        const withoutMd = sizeIndex.get(normalized.slice(0, -3));
        if (withoutMd !== undefined) return withoutMd;
      }
      const basename = normalized.split("/").pop();
      if (basename) {
        const byBase = sizeIndex.get(basename);
        if (byBase !== undefined) return byBase;
      }
    }
    return null;
  }

  private isPatchableNodeCandidate(value: any): value is UnknownRecord {
    if (!value || typeof value !== "object") return false;
    return typeof value.getSize === "function" || this.originalGetSizes.has(value);
  }

  private nodeKeyCandidates(node: UnknownRecord, rawKey?: string): string[] {
    const candidates = new Set<string>();
    if (rawKey) candidates.add(rawKey);

    for (const key of ["id", "path", "file", "key", "name", "label", "title", "text"]) {
      const value = node[key];
      if (typeof value === "string") candidates.add(value);
      if (value && typeof value === "object") {
        for (const nestedKey of ["path", "name", "basename"]) {
          if (typeof value[nestedKey] === "string") candidates.add(value[nestedKey]);
        }
      }
    }

    if (node.data && typeof node.data === "object") {
      for (const key of ["id", "path", "file", "name", "label", "title"]) {
        if (typeof node.data[key] === "string") candidates.add(node.data[key]);
      }
    }

    return Array.from(candidates);
  }

  private rememberOriginals(target: UnknownRecord, props: string[]) {
    if (this.originals.has(target)) return;
    const original: Record<string, any> = {};
    for (const prop of props) {
      if (Object.prototype.hasOwnProperty.call(target, prop)) original[prop] = target[prop];
    }
    this.originals.set(target, original);
  }

  private restorePatchedObjects() {
    for (const target of Array.from(this.patchedObjects)) {
      const original = this.originals.get(target);
      const originalGetSize = this.originalGetSizes.get(target);

      if (originalGetSize) {
        if (originalGetSize.hadOwn) {
          (target as UnknownRecord).getSize = originalGetSize.value;
        } else {
          try {
            delete (target as UnknownRecord).getSize;
          } catch {
            // Non-configurable internal properties can be left alone.
          }
        }
        try {
          delete (target as UnknownRecord).__erpGraphSizeRadius;
        } catch {
          // Non-configurable internal properties can be left alone.
        }
      }

      if (original) {
        for (const prop of ["radius", "r", "size", "nodeSize", "value", "weight"]) {
          if (Object.prototype.hasOwnProperty.call(original, prop)) {
            (target as UnknownRecord)[prop] = original[prop];
          } else {
            try {
              delete (target as UnknownRecord)[prop];
            } catch {
              // Non-configurable internal properties can be left alone.
            }
          }
        }
      }
    }
    this.patchedObjects.clear();
    this.originals = new WeakMap<object, Record<string, any>>();
    this.originalGetSizes = new WeakMap<object, { value: any; hadOwn: boolean }>();
  }

  private requestGraphRefresh(view: UnknownRecord) {
    for (const key of ["changed", "queueRender", "requestDraw", "requestRender", "rerender", "update"]) {
      if (typeof view[key] === "function") {
        try {
          view[key]();
          return;
        } catch {
          // Keep trying other possible method names.
        }
      }
    }
  }

  private throttledNotice(message: string) {
    const now = Date.now();
    if (now - this.lastNoticeAt < 10000) return;
    this.lastNoticeAt = now;
    new Notice(message);
  }

  private isTraversable(value: any): value is object {
    if (!value || typeof value !== "object") return false;
    if (value instanceof HTMLElement) return false;
    if (value instanceof Window) return false;
    return true;
  }

  private isPlainObjectLike(value: any): boolean {
    if (!value || typeof value !== "object") return false;
    if (value instanceof Map || value instanceof Set || Array.isArray(value)) return false;
    if (value instanceof HTMLElement || value instanceof Window) return false;
    return true;
  }

  private safePropertyNames(value: any): string[] {
    try {
      return Object.getOwnPropertyNames(value);
    } catch {
      return [];
    }
  }

  private shouldSkipProperty(key: string): boolean {
    return [
      "app",
      "owner",
      "parent",
      "leaf",
      "containerEl",
      "contentEl",
      "scope",
      "events",
      "component",
      "_children",
      "forward",
      "reverse",
      "source",
      "target",
      "links",
    ].includes(key);
  }
}

class ErpGraphSizePatcherSettingTab extends PluginSettingTab {
  plugin: ErpGraphSizePatcherPlugin;

  constructor(app: App, plugin: ErpGraphSizePatcherPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "ERP Graph Size Patcher" });
    containerEl.createEl("p", {
      text: "Keeps ERP graph node sizes aligned with the vault folder hierarchy. Notes and links are not modified.",
      cls: "erp-graph-size-patcher-status",
    });

    new Setting(containerEl)
      .setName("Auto apply")
      .setDesc("Keep ERP graph sizes applied when Graph View opens or changes.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.enabled)
        .onChange(async (value) => {
          this.plugin.settings.enabled = value;
          await this.plugin.saveSettings();
          if (value) this.plugin.reloadPatchLoop();
          else this.plugin["unpatchAllGraphViews"]();
        }));

    new Setting(containerEl)
      .setName("Apply now")
      .setDesc("Apply ERP graph sizes to the currently open Graph View.")
      .addButton((button) => button
        .setButtonText("Apply")
        .onClick(() => this.plugin["applyOnce"]()));

    new Setting(containerEl)
      .setName("Restore default")
      .setDesc("Return the open Graph View to Obsidian's built-in node sizes.")
      .addButton((button) => button
        .setButtonText("Restore")
        .onClick(() => this.plugin["unpatchAllGraphViews"](true)));
  }
}
