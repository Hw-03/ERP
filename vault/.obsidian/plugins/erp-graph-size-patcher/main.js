var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// _archive/ERP-Vault/.obsidian/plugins/erp-graph-size-patcher/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ErpGraphSizePatcherPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  enabled: true,
  minRadius: 8,
  maxRadius: 120,
  scaleFactor: 4,
  includeExtensions: ".md,.canvas",
  patchIntervalMs: 0
};
var COLLISION_PADDING = 2;
var COLLISION_RADIUS_PROPS = ["collisionRadius", "collideRadius", "radius", "r", "size", "nodeSize"];
var LINK_LENGTH_PROPS = ["distance", "length", "restLength", "targetLength", "desiredLength", "springLength", "linkDistance"];
var RUNTIME_RESTORE_PROPS = [...COLLISION_RADIUS_PROPS, "value", "weight", "mass", "x", "y", ...LINK_LENGTH_PROPS];
var ERP_COLOR_GROUPS = [
  { query: "path:ERP.md", color: { a: 1, rgb: 9133302 } },
  { query: "path:_vault", color: { a: 1, rgb: 16098851 } },
  { query: "path:backend/app/routers", color: { a: 1, rgb: 4367861 } },
  { query: "path:backend/app/services", color: { a: 1, rgb: 2001125 } },
  { query: "path:backend", color: { a: 1, rgb: 1402304 } },
  { query: "path:frontend/app/legacy", color: { a: 1, rgb: 14964526 } },
  { query: "path:frontend", color: { a: 1, rgb: 9256510 } },
  { query: "path:docs", color: { a: 1, rgb: 35195 } },
  { query: "path:scripts", color: { a: 1, rgb: 4431943 } },
  { query: "path:data", color: { a: 1, rgb: 15965202 } },
  { query: "path:docker", color: { a: 1, rgb: 5533306 } }
];
var ErpGraphSizePatcherPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.patchTimer = null;
    this.scheduleTimer = null;
    this.patchedObjects = /* @__PURE__ */ new Set();
    this.originals = /* @__PURE__ */ new WeakMap();
    this.originalGetSizes = /* @__PURE__ */ new WeakMap();
    this.lastNoticeAt = 0;
  }
  async onload() {
    await this.loadSettings();
    await this.ensureGraphColorGroups();
    this.addSettingTab(new ErpGraphSizePatcherSettingTab(this.app, this));
    this.addCommand({
      id: "apply-graph-size-patch-now",
      name: "Apply graph size patch now",
      callback: () => this.applyOnce()
    });
    this.addCommand({
      id: "toggle-graph-size-patcher",
      name: "Toggle graph size patcher",
      callback: async () => {
        this.settings.enabled = !this.settings.enabled;
        await this.saveSettings();
        if (this.settings.enabled) {
          new import_obsidian.Notice("ERP Graph Size Patcher enabled");
          this.startPatchLoop();
          this.schedulePatch();
        } else {
          this.stopPatchLoop();
          this.unpatchAllGraphViews();
          new import_obsidian.Notice("ERP Graph Size Patcher disabled");
        }
      }
    });
    this.addCommand({
      id: "restore-built-in-graph-sizes",
      name: "Restore built-in graph sizes now",
      callback: () => this.unpatchAllGraphViews(true)
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
      patchIntervalMs: 0
    };
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async ensureGraphColorGroups() {
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
        const existing = graph.colorGroups.find((group) => (group == null ? void 0 : group.query) === desired.query);
        if (!existing) {
          graph.colorGroups.push({
            query: desired.query,
            color: { ...desired.color }
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
        await adapter.write(configPath, `${JSON.stringify(graph, null, 2)}
`);
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
  startPatchLoop() {
    if (!this.settings.enabled || this.patchTimer !== null) return;
    if (!this.settings.patchIntervalMs) return;
    this.patchTimer = window.setInterval(
      () => this.patchAllGraphViews(false),
      Math.max(250, this.settings.patchIntervalMs || DEFAULT_SETTINGS.patchIntervalMs)
    );
    this.registerInterval(this.patchTimer);
  }
  stopPatchLoop() {
    if (this.patchTimer !== null) {
      window.clearInterval(this.patchTimer);
      this.patchTimer = null;
    }
  }
  schedulePatch() {
    if (!this.settings.enabled) return;
    if (this.scheduleTimer !== null) window.clearTimeout(this.scheduleTimer);
    this.scheduleTimer = window.setTimeout(() => {
      this.scheduleTimer = null;
      void this.ensureGraphColorGroups();
      this.patchAllGraphViews(false);
    }, 250);
  }
  patchAllGraphViews(showNotice) {
    if (!this.settings.enabled) return;
    void this.ensureGraphColorGroups();
    const sizeIndex = this.buildSizeIndex();
    let graphViews = 0;
    let patchedNodes = 0;
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
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
      new import_obsidian.Notice(`ERP Graph Size Patcher: ${patchedNodes} node(s) patched in ${graphViews} graph view(s).`);
    } else if (graphViews > 0 && patchedNodes === 0) {
      console.warn("[ERP Graph Size Patcher] Graph view found, but no node collection matched.");
    }
  }
  applyOnce() {
    const previousEnabled = this.settings.enabled;
    this.settings.enabled = true;
    try {
      this.patchAllGraphViews(true);
    } finally {
      this.settings.enabled = previousEnabled;
    }
  }
  unpatchAllGraphViews(showNotice = false) {
    this.restorePatchedObjects();
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (!view || typeof view.getViewType !== "function" || view.getViewType() !== "graph") return;
      this.requestGraphRefresh(view);
      for (const renderer of this.findRendererCandidates(view)) this.requestGraphRefresh(renderer);
    });
    if (showNotice) new import_obsidian.Notice("ERP Graph Size Patcher: built-in graph sizes restored.");
  }
  patchGraphView(view, sizeIndex) {
    const renderers = this.findRendererCandidates(view);
    const nodeItems = this.collectGraphNodeItems(view, renderers, sizeIndex);
    if (nodeItems.length === 0) return 0;
    const collisionPatched = this.patchGraphCollision(renderers, nodeItems);
    const patched = /* @__PURE__ */ new Set();
    for (const item of nodeItems) {
      try {
        if (this.patchGraphNode(item.node, item.radius)) patched.add(item.node);
      } catch (error) {
        console.debug("[ERP Graph Size Patcher] Skipped a read-only graph node.", error);
      }
    }
    if (!collisionPatched) {
      console.warn("[ERP Graph Size Patcher] Collision hook not found; size patch applied without collision fallback.");
      this.throttledNotice("ERP Graph Size Patcher: size patch applied; collision hook not found.");
    }
    this.requestGraphRefresh(view);
    for (const renderer of renderers) this.requestGraphRefresh(renderer);
    return patched.size;
  }
  findRendererCandidates(view) {
    const found = /* @__PURE__ */ new Set();
    const add = (value) => {
      if (this.isGraphRendererCandidate(value)) found.add(value);
    };
    for (const key of ["renderer", "graphRenderer", "graph", "engine"]) {
      try {
        add(view[key]);
      } catch (e) {
      }
    }
    const visited = /* @__PURE__ */ new WeakSet();
    const stack = [{ value: view, depth: 0 }];
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
        } catch (e) {
        }
      }
    }
    return Array.from(found);
  }
  isGraphRendererCandidate(value) {
    if (!this.isPlainObjectLike(value)) return false;
    const hasNodes = Boolean(value.nodeLookup || value.nodes || value.nodeList);
    const canRender = ["changed", "queueRender", "setData", "render"].some((key) => typeof value[key] === "function");
    return hasNodes && canRender;
  }
  collectGraphNodeItems(view, renderers, sizeIndex) {
    const nodeRadii = /* @__PURE__ */ new Map();
    const add = (item) => {
      const radius = this.lookupRadius(item.node, item.key, sizeIndex) ?? this.settings.minRadius;
      const current = nodeRadii.get(item.node);
      if (current === void 0 || radius > current) nodeRadii.set(item.node, radius);
    };
    for (const renderer of renderers) {
      for (const source of this.rendererNodeSources(renderer)) {
        if (!source) continue;
        for (const item of this.asNodeCollection(source)) add(item);
      }
    }
    for (const collection of this.findNodeCollections(view)) {
      for (const item of collection) add(item);
    }
    return Array.from(nodeRadii.entries()).map(([node, radius]) => ({ node, radius }));
  }
  rendererNodeSources(renderer) {
    var _a, _b;
    const nodeSources = [
      renderer.nodeLookup,
      renderer.nodes,
      renderer.nodeList,
      (_a = renderer.graph) == null ? void 0 : _a.nodeLookup,
      (_b = renderer.graph) == null ? void 0 : _b.nodes
    ];
    return nodeSources;
  }
  patchGraphNode(node, radius) {
    if (typeof node.getSize !== "function" && !this.originalGetSizes.has(node)) return false;
    const sizeChanged = this.patchGetSize(node, radius);
    if (sizeChanged) {
      try {
        node.fontDirty = true;
      } catch (e) {
      }
    }
    return true;
  }
  patchGetSize(node, radius) {
    const previous = node.__erpGraphSizeRadius;
    const hadOwn = Object.prototype.hasOwnProperty.call(node, "getSize");
    const original = node.getSize;
    if (typeof original !== "function" && !this.originalGetSizes.has(node)) return previous !== radius;
    if (!this.originalGetSizes.has(node)) {
      this.originalGetSizes.set(node, { value: original, hadOwn });
      this.patchedObjects.add(node);
    }
    const originalEntry = this.originalGetSizes.get(node);
    const fallback = originalEntry == null ? void 0 : originalEntry.value;
    try {
      Object.defineProperty(node, "__erpGraphSizeRadius", {
        value: radius,
        writable: true,
        configurable: true
      });
      Object.defineProperty(node, "getSize", {
        configurable: true,
        writable: true,
        value: function patchedErpGraphNodeSize() {
          const patchedRadius = this.__erpGraphSizeRadius;
          if (typeof patchedRadius === "number" && Number.isFinite(patchedRadius)) return patchedRadius;
          return typeof fallback === "function" ? fallback.call(this) : radius;
        }
      });
    } catch (e) {
      try {
        node.__erpGraphSizeRadius = radius;
        node.getSize = function patchedErpGraphNodeSize() {
          const patchedRadius = this.__erpGraphSizeRadius;
          if (typeof patchedRadius === "number" && Number.isFinite(patchedRadius)) return patchedRadius;
          return typeof fallback === "function" ? fallback.call(this) : radius;
        };
      } catch (e2) {
        return false;
      }
    }
    return previous !== radius;
  }
  patchGraphCollision(renderers, nodeItems) {
    const accessorCount = this.patchCollisionAccessors(renderers);
    let patched = accessorCount > 0;
    for (const item of nodeItems) {
      const collisionRadius = item.radius + COLLISION_PADDING;
      if (!this.setNodeCollisionRadius(item.node, collisionRadius)) return false;
      if (accessorCount === 0 && this.patchNumericCollisionRadiusProps(item.node, collisionRadius)) {
        patched = true;
      }
    }
    if (this.separateOverlappingNodes(nodeItems)) patched = true;
    return patched;
  }
  patchCollisionAccessors(renderers) {
    let patched = 0;
    for (const target of this.findPhysicsCandidates(renderers)) {
      for (const key of this.safePropertyNames(target)) {
        if (!this.isCollisionRadiusAccessorName(key)) continue;
        if (this.patchCollisionAccessor(target, key)) patched += 1;
      }
    }
    return patched;
  }
  findPhysicsCandidates(renderers) {
    const found = /* @__PURE__ */ new Set();
    const visited = /* @__PURE__ */ new WeakSet();
    const stack = [];
    for (const renderer of renderers) {
      stack.push({ value: renderer, depth: 0 });
      for (const key of ["graph", "engine", "simulation", "force", "forces", "collision", "collide", "physics"]) {
        try {
          if (this.isTraversable(renderer[key])) stack.push({ value: renderer[key], depth: 0 });
        } catch (e) {
        }
      }
    }
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) break;
      const value = current.value;
      if (!this.isPlainObjectLike(value) || visited.has(value)) continue;
      visited.add(value);
      found.add(value);
      if (current.depth >= 3) continue;
      for (const key of this.safePropertyNames(value)) {
        if (this.shouldSkipPhysicsProperty(key)) continue;
        try {
          const next = value[key];
          if (this.isPlainObjectLike(next)) stack.push({ value: next, depth: current.depth + 1 });
        } catch (e) {
        }
      }
    }
    return Array.from(found);
  }
  isCollisionRadiusAccessorName(key) {
    const normalized = key.toLowerCase();
    if (normalized.includes("radius")) return true;
    if (normalized.includes("nodesize")) return true;
    if (normalized === "getsize" || normalized === "size") return true;
    if (normalized.includes("collisionsize")) return true;
    return false;
  }
  patchCollisionAccessor(target, key) {
    const current = target[key];
    if (typeof current !== "function") return false;
    if (current.__erpGraphCollisionAccessor === true) return false;
    this.rememberOriginals(target, [key]);
    const original = this.originals.get(target)?.[key] || current;
    const plugin = this;
    const wrapped = function erpCollisionRadiusAccessor(...args) {
      const collisionRadius = plugin.findCollisionRadiusForCall(this, args);
      if (collisionRadius !== null) return collisionRadius;
      return original.apply(this, args);
    };
    try {
      Object.defineProperty(wrapped, "__erpGraphCollisionAccessor", {
        value: true,
        configurable: true
      });
      target[key] = wrapped;
      this.patchedObjects.add(target);
      return true;
    } catch (e) {
      return false;
    }
  }
  findCollisionRadiusForCall(context, args) {
    for (const value of args) {
      const radius = this.readCollisionRadius(value);
      if (radius !== null) return radius;
    }
    return this.readCollisionRadius(context);
  }
  readCollisionRadius(value) {
    if (!value || typeof value !== "object") return null;
    const radius = value.__erpCollisionRadius;
    return typeof radius === "number" && Number.isFinite(radius) ? radius : null;
  }
  setNodeCollisionRadius(node, collisionRadius) {
    try {
      Object.defineProperty(node, "__erpCollisionRadius", {
        value: collisionRadius,
        writable: true,
        configurable: true
      });
      this.patchedObjects.add(node);
      return true;
    } catch (e) {
      try {
        node.__erpCollisionRadius = collisionRadius;
        this.patchedObjects.add(node);
        return true;
      } catch (e2) {
        return false;
      }
    }
  }
  patchNumericCollisionRadiusProps(node, collisionRadius) {
    let patched = false;
    for (const prop of COLLISION_RADIUS_PROPS) {
      const current = node[prop];
      if (typeof current !== "number" || !Number.isFinite(current)) continue;
      this.rememberOriginals(node, [prop]);
      node[prop] = collisionRadius;
      patched = true;
    }
    return patched;
  }
  separateOverlappingNodes(nodeItems) {
    const positioned = nodeItems.map((item, index) => {
      const position = this.readNodePosition(item.node);
      if (!position) return null;
      return {
        node: item.node,
        index,
        x: position.x,
        y: position.y,
        radius: item.radius + COLLISION_PADDING
      };
    }).filter((item) => item !== null);
    if (positioned.length < 2) return false;
    let moved = false;
    for (let iteration = 0; iteration < 6; iteration += 1) {
      let movedThisIteration = false;
      for (let i = 0; i < positioned.length; i += 1) {
        for (let j = i + 1; j < positioned.length; j += 1) {
          const a = positioned[i];
          const b = positioned[j];
          const minDistance = a.radius + b.radius + COLLISION_PADDING;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let distanceSq = dx * dx + dy * dy;
          if (distanceSq >= minDistance * minDistance) continue;
          if (distanceSq === 0) {
            const angle = ((a.index + 1) * 97 + (b.index + 1) * 53) % 360;
            const radians = angle * Math.PI / 180;
            dx = Math.cos(radians);
            dy = Math.sin(radians);
            distanceSq = 1;
          }
          const distance = Math.sqrt(distanceSq);
          const push = (minDistance - distance) / 2;
          const nx = dx / distance;
          const ny = dy / distance;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          moved = true;
          movedThisIteration = true;
        }
      }
      if (!movedThisIteration) break;
    }
    if (!moved) return false;
    for (const item of positioned) {
      this.writeNodePosition(item.node, item.x, item.y);
    }
    return true;
  }
  readNodePosition(node) {
    if (typeof node.x === "number" && Number.isFinite(node.x) && typeof node.y === "number" && Number.isFinite(node.y)) {
      return { x: node.x, y: node.y };
    }
    for (const key of ["position", "pos"]) {
      const value = node[key];
      if (value && typeof value === "object" && typeof value.x === "number" && Number.isFinite(value.x) && typeof value.y === "number" && Number.isFinite(value.y)) {
        return { x: value.x, y: value.y };
      }
    }
    return null;
  }
  writeNodePosition(node, x, y) {
    if (typeof node.x === "number" && Number.isFinite(node.x) && typeof node.y === "number" && Number.isFinite(node.y)) {
      this.rememberOriginals(node, ["x", "y"]);
      node.x = x;
      node.y = y;
      this.patchedObjects.add(node);
      return;
    }
    for (const key of ["position", "pos"]) {
      const value = node[key];
      if (value && typeof value === "object" && typeof value.x === "number" && Number.isFinite(value.x) && typeof value.y === "number" && Number.isFinite(value.y)) {
        this.rememberOriginals(value, ["x", "y"]);
        value.x = x;
        value.y = y;
        this.patchedObjects.add(value);
        return;
      }
    }
  }
  buildSizeIndex() {
    const includedExtensions = this.getIncludedExtensions();
    const includedFiles = this.app.vault.getFiles().filter((file) => !file.path.startsWith(".obsidian/")).filter((file) => includedExtensions.has(`.${file.extension.toLowerCase()}`));
    const folderCounts = /* @__PURE__ */ new Map();
    folderCounts.set("", includedFiles.length);
    for (const file of includedFiles) {
      const parts = file.path.split("/");
      for (let i = 1; i < parts.length; i += 1) {
        const folder = parts.slice(0, i).join("/");
        folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);
      }
    }
    const representedFolders = /* @__PURE__ */ new Set();
    for (const file of includedFiles) {
      const folder = this.getRepresentedFolder(file);
      if (folder !== null) representedFolders.add(folder);
    }
    const maxDescendantCount = Math.max(1, ...Array.from(representedFolders).map((folder) => folderCounts.get(folder) || 0));
    const sizeIndex = /* @__PURE__ */ new Map();
    for (const file of includedFiles) {
      const folder = this.getRepresentedFolder(file);
      const descendantCount = folder !== null ? folderCounts.get(folder) || 0 : 0;
      const radius = descendantCount > 0 ? this.radiusForCount(descendantCount, maxDescendantCount) : this.settings.minRadius;
      for (const alias of this.aliasesForFile(file, folder)) {
        this.setMaxSize(sizeIndex, alias, radius);
      }
    }
    return sizeIndex;
  }
  getIncludedExtensions() {
    const raw = this.settings.includeExtensions || DEFAULT_SETTINGS.includeExtensions;
    const values = raw.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean).map((value) => value.startsWith(".") ? value : `.${value}`);
    return new Set(values.length ? values : [".md", ".canvas"]);
  }
  radiusForCount(count, maxCount) {
    const safeCount = Math.max(0, count);
    const safeMax = Math.max(1, maxCount);
    const normalized = Math.sqrt(safeCount) / Math.sqrt(safeMax);
    const raw = this.settings.minRadius + normalized * (this.settings.maxRadius - this.settings.minRadius);
    return Math.max(this.settings.minRadius, Math.min(this.settings.maxRadius, raw));
  }
  getRepresentedFolder(file) {
    var _a;
    const parent = ((_a = file.parent) == null ? void 0 : _a.path) || "";
    const basename = this.normalizeHubBasename(file.basename);
    if (!parent || parent === "/") {
      if (["ERP", "_ERP", "ERP-Vault", "_ERP-Vault", "vault", "_vault"].includes(basename)) return "";
      return null;
    }
    const folderName = parent.split("/").pop() || "";
    if (basename === folderName || basename === `_${folderName}`) return parent;
    return null;
  }
  aliasesForFile(file, representedFolder) {
    const aliases = /* @__PURE__ */ new Set();
    const pathNoMd = file.path.endsWith(".md") ? file.path.slice(0, -3) : file.path;
    const nameNoMd = file.name.endsWith(".md") ? file.name.slice(0, -3) : file.name;
    aliases.add(file.path);
    aliases.add(pathNoMd);
    aliases.add(file.name);
    aliases.add(nameNoMd);
    aliases.add(file.basename);
    const leafName = file.basename.includes(".") ? file.basename.split(".").slice(0, -1).join(".") : file.basename;
    if (leafName) aliases.add(leafName);
    if (representedFolder !== null) {
      const folderName = representedFolder ? representedFolder.split("/").pop() || representedFolder : file.basename;
      if (representedFolder) aliases.add(representedFolder);
      aliases.add(folderName);
      aliases.add(`_${folderName}`);
      aliases.add(`📁_${folderName}`);
      if (!representedFolder) {
        aliases.add("/");
        aliases.add("root");
      }
    }
    return Array.from(aliases).map((alias) => this.normalizeKey(alias));
  }
  setMaxSize(map, key, radius) {
    const current = map.get(key);
    if (current === void 0 || radius > current) map.set(key, radius);
  }
  normalizeKey(value) {
    return String(value).replace(/\\/g, "/").replace(/^\/+/, "").trim().toLowerCase();
  }
  normalizeHubBasename(value) {
    return value.replace(/^📁_/, "");
  }
  findNodeCollections(view) {
    const collections = [];
    const visited = /* @__PURE__ */ new WeakSet();
    const stack = [{ value: view, depth: 0 }];
    let inspected = 0;
    while (stack.length > 0 && inspected < 2500) {
      const current = stack.pop();
      if (!current) break;
      const value = current.value;
      if (!this.isTraversable(value) || visited.has(value)) continue;
      visited.add(value);
      inspected += 1;
      const collection = this.asNodeCollection(value);
      if (collection.length > 0) collections.push(collection);
      if (current.depth >= 6) continue;
      for (const key of this.safePropertyNames(value)) {
        if (this.shouldSkipProperty(key)) continue;
        try {
          const next = value[key];
          if (this.isTraversable(next)) stack.push({ value: next, depth: current.depth + 1 });
        } catch (e) {
        }
      }
    }
    return collections;
  }
  asNodeCollection(value) {
    const result = [];
    if (value instanceof Map) {
      for (const [key, node] of value.entries()) {
        if (this.isPatchableNodeCandidate(node)) result.push({ node, key: String(key) });
      }
      return result.length > 0 ? result : [];
    }
    if (value instanceof Set) {
      for (const node of value.values()) {
        if (this.isPatchableNodeCandidate(node)) result.push({ node });
      }
      return result.length > 0 ? result : [];
    }
    if (Array.isArray(value)) {
      for (const node of value) {
        if (this.isPatchableNodeCandidate(node)) result.push({ node });
      }
      return result.length > 0 ? result : [];
    }
    if (this.isPlainObjectLike(value)) {
      for (const key of Object.keys(value)) {
        const node = value[key];
        if (this.isPatchableNodeCandidate(node)) result.push({ node, key });
      }
      return result.length > 0 ? result : [];
    }
    return [];
  }
  lookupRadius(node, rawKey, sizeIndex) {
    if (!node || typeof node !== "object") return null;
    const candidates = this.nodeKeyCandidates(node, rawKey);
    for (const candidate of candidates) {
      const normalized = this.normalizeKey(candidate);
      const direct = sizeIndex.get(normalized);
      if (direct !== void 0) return direct;
      if (normalized.endsWith(".md")) {
        const withoutMd = sizeIndex.get(normalized.slice(0, -3));
        if (withoutMd !== void 0) return withoutMd;
      }
      const basename = normalized.split("/").pop();
      if (basename) {
        const byBase = sizeIndex.get(basename);
        if (byBase !== void 0) return byBase;
      }
    }
    return null;
  }
  isPatchableNodeCandidate(value) {
    if (!value || typeof value !== "object") return false;
    return typeof value.getSize === "function" || this.originalGetSizes.has(value);
  }
  nodeKeyCandidates(node, rawKey) {
    const candidates = /* @__PURE__ */ new Set();
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
  rememberOriginals(target, props) {
    const original = this.originals.get(target) || {};
    for (const prop of props) {
      if (Object.prototype.hasOwnProperty.call(original, prop)) continue;
      if (Object.prototype.hasOwnProperty.call(target, prop)) original[prop] = target[prop];
    }
    this.originals.set(target, original);
  }
  restorePatchedObjects() {
    for (const target of Array.from(this.patchedObjects)) {
      const original = this.originals.get(target);
      const originalGetSize = this.originalGetSizes.get(target);
      if (originalGetSize) {
        if (originalGetSize.hadOwn) {
          target.getSize = originalGetSize.value;
        } else {
          try {
            delete target.getSize;
          } catch (e) {
          }
        }
        try {
          delete target.__erpGraphSizeRadius;
        } catch (e) {
        }
      }
      try {
        delete target.__erpCollisionRadius;
      } catch (e) {
      }
      if (original) {
        const props = new Set([...Object.keys(original), ...RUNTIME_RESTORE_PROPS]);
        for (const prop of props) {
          if (Object.prototype.hasOwnProperty.call(original, prop)) {
            target[prop] = original[prop];
          } else {
            try {
              delete target[prop];
            } catch (e) {
            }
          }
        }
      }
    }
    this.patchedObjects.clear();
    this.originals = /* @__PURE__ */ new WeakMap();
    this.originalGetSizes = /* @__PURE__ */ new WeakMap();
  }
  requestGraphRefresh(view) {
    for (const key of ["changed", "queueRender", "requestDraw", "requestRender", "rerender", "update"]) {
      if (typeof view[key] === "function") {
        try {
          view[key]();
          return;
        } catch (e) {
        }
      }
    }
  }
  throttledNotice(message) {
    const now = Date.now();
    if (now - this.lastNoticeAt < 1e4) return;
    this.lastNoticeAt = now;
    new import_obsidian.Notice(message);
  }
  isTraversable(value) {
    if (!value || typeof value !== "object") return false;
    if (value instanceof HTMLElement) return false;
    if (value instanceof Window) return false;
    return true;
  }
  isPlainObjectLike(value) {
    if (!value || typeof value !== "object") return false;
    if (value instanceof Map || value instanceof Set || Array.isArray(value)) return false;
    if (value instanceof HTMLElement || value instanceof Window) return false;
    return true;
  }
  safePropertyNames(value) {
    try {
      return Object.getOwnPropertyNames(value);
    } catch (e) {
      return [];
    }
  }
  shouldSkipProperty(key) {
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
      "links"
    ].includes(key);
  }
  shouldSkipPhysicsProperty(key) {
    if (this.shouldSkipProperty(key)) return true;
    return [
      "nodeLookup",
      "nodes",
      "nodeList",
      "links",
      "edges",
      "linkLookup",
      "edgeLookup",
      "source",
      "target"
    ].includes(key);
  }
};
var ErpGraphSizePatcherSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "ERP Graph Size Patcher" });
    containerEl.createEl("p", {
      text: "Keeps ERP graph node sizes and runtime collision radii aligned with the vault folder hierarchy. Notes and vault links are not modified.",
      cls: "erp-graph-size-patcher-status"
    });
    new import_obsidian.Setting(containerEl).setName("Auto apply").setDesc("Keep ERP graph sizes applied when Graph View opens or changes.").addToggle((toggle) => toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
      this.plugin.settings.enabled = value;
      await this.plugin.saveSettings();
      if (value) this.plugin.reloadPatchLoop();
      else this.plugin["unpatchAllGraphViews"]();
    }));
    new import_obsidian.Setting(containerEl).setName("Apply now").setDesc("Apply ERP graph sizes to the currently open Graph View.").addButton((button) => button.setButtonText("Apply").onClick(() => this.plugin["applyOnce"]()));
    new import_obsidian.Setting(containerEl).setName("Restore default").setDesc("Return the open Graph View to Obsidian's built-in node sizes.").addButton((button) => button.setButtonText("Restore").onClick(() => this.plugin["unpatchAllGraphViews"](true)));
  }
};
