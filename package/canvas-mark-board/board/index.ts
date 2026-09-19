import { Eventer } from "../decorator/event";
import { useModule } from "../decorator/rewrite";
import { markMap, MarkObject, MarkObjectType } from "../object/index";
import ClickMarkObject from "../object/clickMark";
import MoveMarkObject from "../object/moveMark";
import MarkHistory from "../history/History";
import MarkLayer from "../layer/Layer";
import * as MarkBoardUtils from "../utils";
const { scaleOfOuter } = MarkBoardUtils.MatrixHelper;

import type {
  ICanvasMarkBoard,
  IMarkBoardConfig,
  IMatrixData,
  IMarkBoardDrawType,
  IPointData,
  IMarkObjectInfo,
  IMarkObjectId,
  IObject,
  IEventListenerId,
  IEventListener,
  IMarkObjectJSON,
  IFunction,
  IObjectLabelData,
  ILayerData,
  ILayerJSON,
  IMarkBoardJSON,
  IHistorySnapshot,
} from "../types";

const DEFAULT_LAYER = "default";

@useModule(Eventer)
export default class CanvasMarkBoard implements ICanvasMarkBoard {
  static MoveMarkObject = MoveMarkObject;
  static ClickMarkObject = ClickMarkObject;
  static MarkBoardUtils = MarkBoardUtils;
  static MarkLayer = MarkLayer;
  static MarkHistory = MarkHistory;
  static DEFAULT_LAYER_ID = DEFAULT_LAYER;

  view!: HTMLElement;
  canvas!: HTMLCanvasElement;
  img!: HTMLImageElement;
  regionCanvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
  regionCtx!: CanvasRenderingContext2D;
  config: Omit<IMarkBoardConfig, "view"> = {
    drawColor: "yellow",
    lineWidth: 2,
    fillColor: "rgba(255, 255, 255, 0.3)",
    showLabel: false,
  };
  t: IMatrixData = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  initLayout = { zoom: 1, offsetx: 0, offsety: 0, width: 0, height: 0 };
  lastMovePoint: IPointData = { x: 0, y: 0 };
  // 平移状态
  moveStatus = false;
  // 鼠标按下
  mouseDown = false;
  // 拖拽状态（兼容外部读取）
  drag = false;
  /** 主选标注对象 */
  selectObject?: MarkObject;
  /** 多选 id 集合（含主选） */
  selectedIds: string[] = [];
  currentDrawingType: IMarkBoardDrawType = MarkObjectType.NONE;
  markObjectList: MarkObject[] = [];
  /** 图层，数组顺序即图层顺序，末尾在最上层 */
  layerList: MarkLayer[] = [];
  /** 当前激活图层 id（新建对象归属） */
  activeLayerId: string = DEFAULT_LAYER;
  /** 操作历史 */
  history!: MarkHistory;
  renderGroup: any[] = [];
  markMap: any = markMap;

  // 框选状态
  boxSelecting = false;
  boxSelectStart: IPointData | null = null;
  boxSelectPoint: IPointData | null = null;
  boxSelectMoved = false;
  // 整体拖动状态
  groupDrag = false;
  dragMoved = false;
  dragStartPoint: IPointData = { x: 0, y: 0 };
  // regionCtx 每帧只清空一次
  private regionFrame = 0;

  /** 初始化标注画布 */
  constructor(config: IMarkBoardConfig) {
    this.init(config);
  }
  init(config: IMarkBoardConfig) {
    // 初始化默认图层与历史
    this.layerList = [
      new MarkLayer({ id: DEFAULT_LAYER, name: "默认图层" }),
    ];
    this.activeLayerId = DEFAULT_LAYER;
    this.history = new MarkHistory(this.getSnapshot());

    // 合并配置
    Object.assign(this.config, config || {});
    this.view =
      typeof config.view === "string"
        ? (document.querySelector(config.view) as HTMLElement)
        : config.view;
    this.view.style.overflow = "hidden";
    this.view.style.position = "relative";
    this.view.style.cursor = "default";

    this.canvas = this.createCanvas();
    this.regionCanvas = this.createCanvas();
    this.ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;
    this.regionCtx = this.regionCanvas.getContext(
      "2d"
    ) as CanvasRenderingContext2D;

    this.view.addEventListener("mousemove", this.appMousemove.bind(this));
    this.view.addEventListener("mousedown", this.appMousedown.bind(this));
    this.view.addEventListener("mouseup", this.appMouseup.bind(this));
    this.view.addEventListener("wheel", this.appWheel.bind(this));
    this.view.addEventListener("dblclick", this.appDblclick.bind(this));
    this.view.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.emit("oncontextmenu", this.lastMovePoint);
    });
    this.windowKeydown = this.windowKeydown.bind(this);
    this.windowKeyup = this.windowKeyup.bind(this);
    window.addEventListener("keydown", this.windowKeydown);
    window.addEventListener("keyup", this.windowKeyup);
  }

  register(type: string, markObject: any) {
    if (!type || !markObject) {
      throw new Error(`need type or markObject`);
    }
    this.markMap[type] = markObject;
  }

  get viewDomInfo() {
    return this.view.getBoundingClientRect();
  }
  get lastPoint(): IPointData | null {
    if (!this.lastMovePoint) return null;
    return this.lastMovePoint;
  }

  /** 创建canvas */
  createCanvas() {
    let canvas = document.createElement("canvas");
    canvas.setAttribute(
      "style",
      ` width: ${this.viewDomInfo.width}px;
        height: ${this.viewDomInfo.height}px;
        position: absolute;
        `
    );
    canvas.width = this.viewDomInfo.width;
    canvas.height = this.viewDomInfo.height;
    this.view.appendChild(canvas);

    return canvas;
  }
  /**
   * 清除canvas
   */
  clearCanvas(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }
  /** region 层每帧仅清空一次（兼容自定义标注内部的清空调用） */
  clearRegionOnce() {
    if (this.regionFrame === this._frameToken) return;
    this.regionFrame = this._frameToken;
    this.clearCanvas(this.regionCtx);
  }
  private _frameToken = 0;

  /* ============================ 图层能力 ============================ */

  get layers(): ILayerJSON[] {
    return this.layerList.map((layer) => layer.toJSON());
  }

  getLayer(id: string): MarkLayer | undefined {
    return this.layerList.find((layer) => layer.id === id);
  }

  /** 图层是否可见（未知图层按默认图层处理） */
  isLayerVisible(id: string): boolean {
    const layer = this.getLayer(id) || this.getLayer(DEFAULT_LAYER);
    return layer ? layer.visible : true;
  }

  /** 图层是否可编辑（可见且未锁定） */
  isLayerEditable(id: string): boolean {
    const layer = this.getLayer(id) || this.getLayer(DEFAULT_LAYER);
    return layer ? layer.visible && !layer.locked : true;
  }

  /** 新建对象应归属的图层：激活图层不可编辑时回退默认图层 */
  getActiveLayerIdForNew(): string {
    const active = this.getLayer(this.activeLayerId);
    if (active && active.visible && !active.locked) return active.id;
    const def = this.getLayer(DEFAULT_LAYER);
    if (def && def.visible && !def.locked) return def.id;
    // 没有可编辑图层时仍归入激活图层
    return this.activeLayerId;
  }

  /** 新增图层 */
  addLayer(data?: ILayerData): string {
    const layer = new MarkLayer(data);
    const id = this.runHistory("新增图层", () => {
      this.layerList.push(layer);
      return layer.id;
    });
    this.setActiveLayer(id);
    return id;
  }

  /** 删除图层（默认图层不可删），图层内对象一并删除 */
  deleteLayer(id: string) {
    if (id === DEFAULT_LAYER) return;
    const layer = this.getLayer(id);
    if (!layer) return;
    this.runHistory("删除图层", () => {
      const removed = this.markObjectList.filter(
        (item) => item.layerId === id && item.status !== "draw"
      );
      removed.forEach((item) => item.destory());
      this.markObjectList = this.markObjectList.filter(
        (item) => item.layerId !== id
      );
      this.layerList.splice(this.layerList.indexOf(layer), 1);
      this.selectedIds = this.selectedIds.filter((sid) =>
        this.markObjectList.some((item) => item.id === sid)
      );
      if (this.activeLayerId === id) {
        this.activeLayerId = DEFAULT_LAYER;
      }
      this.syncSelectObject();
    });
  }

  /** 修改图层属性（名称/显隐/锁定/透明度） */
  updateLayer(id: string, data: Partial<Omit<ILayerJSON, "id">>) {
    const layer = this.getLayer(id);
    if (!layer) return;
    const labelMap: Record<string, string> = {
      name: "修改图层",
      visible: "切换图层显隐",
      locked: "切换图层锁定",
      opacity: "调整图层透明度",
    };
    const keys = Object.keys(data);
    const label =
      keys.map((key) => labelMap[key]).find(Boolean) || "修改图层";
    const coalesceKey =
      keys.includes("opacity") || keys.includes("name")
        ? `layer:${keys.sort().join(",")}:${id}`
        : undefined;
    this.runHistory(
      label,
      () => {
        layer.setData(data);
        // 隐藏或锁定后，该图层对象不能再被选中
        if (!layer.visible || layer.locked) {
          this.deselectLayerObjects(id);
        }
        this.syncSelectObject();
      },
      coalesceKey
    );
    this.emit("onlayerchange");
  }

  /** 图层排序：将 id 移动到 targetIndex 位置 */
  setLayerIndex(id: string, targetIndex: number) {
    const from = this.layerList.findIndex((layer) => layer.id === id);
    if (from === -1) return;
    const to = Math.max(0, Math.min(targetIndex, this.layerList.length - 1));
    if (from === to) return;
    this.runHistory("图层排序", () => {
      const [layer] = this.layerList.splice(from, 1);
      this.layerList.splice(to, 0, layer);
    });
  }

  /** 拖拽排序：把 dragId 放置到 targetId 相邻位置 */
  moveLayer(dragId: string, targetId: string) {
    const targetIndex = this.layerList.findIndex(
      (layer) => layer.id === targetId
    );
    if (targetIndex === -1) return;
    this.setLayerIndex(dragId, targetIndex);
  }

  /** 设置当前激活图层（新建对象归属） */
  setActiveLayer(id: string) {
    const layer = this.getLayer(id);
    if (!layer || this.activeLayerId === id) return;
    this.activeLayerId = id;
    // 同步重建尚未开始绘制的草稿对象，使其归属新激活图层
    this.refreshPendingDrawing();
    this.emit("onlayerchange");
  }

  /** 重建绘制中的草稿对象（保留绘制类型），用于图层/归属变更 */
  private refreshPendingDrawing() {
    if (!this.currentDrawingType) return;
    const obj = this.markObjectList[this.markObjectList.length - 1];
    if (obj && obj.status === "draw" && obj.pointList.length === 0) {
      obj.destory();
      this.markObjectList.pop();
      this.addObjectData();
    }
  }

  private deselectLayerObjects(layerId: string) {
    this.selectedIds = this.selectedIds.filter((sid) => {
      const obj = this.markObjectList.find((item) => item.id === sid);
      if (!obj) return false;
      if (obj.layerId === layerId) {
        if (obj.status === "edit") obj.status = "done";
        return false;
      }
      return true;
    });
  }

  /* ============================ 多选能力 ============================ */

  get selectedObjects(): MarkObject[] {
    return this.selectedIds
      .map((id) => this.markObjectList.find((item) => item.id === id))
      .filter((item): item is MarkObject => !!item && item.status !== "draw");
  }

  isSelected(id: string): boolean {
    return this.selectedIds.includes(id);
  }

  /**
   * 设置选中集合（主选为第一个）。
   * 隐藏/锁定图层上的对象不可选；若传入的全部对象都不可选，保持当前选择不变
   * （例如点击锁定图层对象不会清空已有的有效选择）。
   */
  setSelected(ids: string[]) {
    const valid = ids.filter((id) => {
      const obj = this.markObjectList.find((item) => item.id === id);
      return obj && obj.status !== "draw" && obj.layerEditable;
    });
    if (valid.length === 0 && ids.length > 0 && this.selectedIds.length) {
      return;
    }
    this.selectedIds = Array.from(new Set(valid));
    this.syncSelectObject();
    this.renderAll();
    this.emit("onselect", this.selectedIds.slice());
    this.emit("onchange");
  }

  /** 根据 selectedIds 同步每个对象的状态与主选对象 */
  private syncSelectObject() {
    this.markObjectList.forEach((item) => {
      if (item.status === "draw") return;
      const selected = this.selectedIds.includes(item.id);
      item.status = selected ? "edit" : "done";
    });
    const primary =
      this.selectedObjects.find((item) => item.id === this.selectObject?.id) ||
      this.selectedObjects[0];
    this.selectObject = primary;
  }

  /** 获取某坐标最上层的可点选对象（隐藏/锁定图层不参与） */
  getObjectAtPoint(point: IPointData): MarkObject | undefined {
    const layerIds = this.layerList.map((layer) => layer.id);
    // 图层从上层到下层，图层内对象从后到前（后创建在上）
    for (let li = layerIds.length - 1; li >= 0; li--) {
      const layerId = layerIds[li];
      if (!this.isLayerEditable(layerId)) continue;
      for (let i = this.markObjectList.length - 1; i >= 0; i--) {
        const obj = this.markObjectList[i];
        if (obj.status === "draw" || obj.layerId !== layerId) continue;
        if (obj.isPointInside(point)) return obj;
      }
    }
    // 兼容未指定图层的旧对象
    for (let i = this.markObjectList.length - 1; i >= 0; i--) {
      const obj = this.markObjectList[i];
      if (obj.status === "draw") continue;
      if (!this.getLayer(obj.layerId) && obj.isPointInside(point)) return obj;
    }
    return undefined;
  }

  /** 计算对象包围盒（基于结果点） */
  private getObjectBBox(obj: MarkObject) {
    const points = obj.resultPoints || obj.pointList;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    points.forEach((point) => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
    return { minX, minY, maxX, maxY };
  }

  /** 框选范围内（相交）的可编辑对象 */
  private getObjectsInRect(a: IPointData, b: IPointData): MarkObject[] {
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x, b.x);
    const y2 = Math.max(a.y, b.y);
    return this.markObjectList.filter((obj) => {
      if (obj.status === "draw" || !obj.layerEditable) return false;
      const box = this.getObjectBBox(obj);
      return (
        box.maxX >= x1 && box.minX <= x2 && box.maxY >= y1 && box.minY <= y2
      );
    });
  }

  /** 选中全部 */
  selectAll() {
    this.setSelected(
      this.markObjectList
        .filter((item) => item.status !== "draw" && item.layerEditable)
        .map((item) => item.id)
    );
  }

  /** 取消选中（Esc） */
  clearSelection() {
    if (this.selectedIds.length) {
      this.setSelected([]);
    }
  }

  /** 取消当前绘制中的图形 */
  cancelDrawing() {
    const drawing = this.markObjectList.find(
      (item) => item.status === "draw"
    );
    if (drawing) {
      drawing.destory();
      this.markObjectList.splice(this.markObjectList.indexOf(drawing), 1);
      this.currentDrawingType = "";
      this.renderAll();
      this.emit("ondraw", { type: "" });
    }
  }

  /* ============================ 历史能力 ============================ */

  /** 当前完整快照（图层 + 已完成对象） */
  getSnapshot(): IHistorySnapshot {
    return {
      layers: this.layerList.map((layer) => layer.toJSON()),
      objects: this.markObjectList
        .filter((item) => item.status !== "draw")
        .map((item) => item.export()),
    };
  }

  /** 在一次历史事务中执行修改：记录操作前快照，执行后提交 */
  runHistory<T>(
    label: string,
    fn: () => T,
    coalesceKey?: string
  ): T {
    const before = this.getSnapshot();
    const result = fn();
    if (coalesceKey) {
      // 连续同类修改（如拖动透明度、输入名称）合并为一条历史
      this.history.begin(label, before, coalesceKey);
      this.history.commit(this.getSnapshot());
    } else {
      this.history.push(label, before, this.getSnapshot());
    }
    this.afterHistoryChange();
    return result;
  }

  /** 拖拽等跨鼠标事件操作：按下时开启 */
  beginHistory(label: string, coalesceKey?: string) {
    this.history.begin(label, this.getSnapshot(), coalesceKey);
  }

  /** 拖拽等跨鼠标事件操作：抬起时提交 */
  commitHistory() {
    this.history.commit(this.getSnapshot());
    this.afterHistoryChange();
  }

  cancelHistory() {
    this.history.cancel();
  }

  private afterHistoryChange() {
    this.renderAll();
    this.emit("onhistory", {
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      list: this.history.list,
      index: this.history.index,
    });
    this.emit("onchange");
    this.emit("onlayerchange");
  }

  /** 新对象创建完成后入历史（对象已在列表中） */
  commitCreate(_obj: MarkObject) {
    const after = this.getSnapshot();
    const before: IHistorySnapshot = {
      layers: after.layers,
      objects: after.objects.filter((item) => item.id !== _obj.id),
    };
    this.history.push("新增标注", before, after);
    this.afterHistoryChange();
  }

  undo() {
    const snapshot = this.history.undo();
    if (snapshot) this.restoreSnapshot(snapshot);
  }

  redo() {
    const snapshot = this.history.redo();
    if (snapshot) this.restoreSnapshot(snapshot);
  }

  /** 历史栏跳转到指定节点 */
  goHistory(index: number) {
    const snapshot = this.history.goTo(index);
    if (snapshot) this.restoreSnapshot(snapshot);
  }

  /** 恢复快照时复位所有交互态 */
  private resetInteractionState() {
    this.groupDrag = false;
    this.dragMoved = false;
    this.boxSelecting = false;
    this.boxSelectStart = null;
    this.boxSelectPoint = null;
    this.boxSelectMoved = false;
    this.mouseDown = false;
    this.drag = false;
  }

  /** 用快照重建图层与对象 */
  private restoreSnapshot(snapshot: IHistorySnapshot) {
    this.resetInteractionState();
    // 销毁旧对象（解绑事件）
    this.markObjectList.forEach((item) => item.destory());
    this.markObjectList = [];
    this.selectedIds = [];
    this.selectObject = undefined;

    this.layerList = (snapshot.layers?.length
      ? snapshot.layers
      : [{ id: DEFAULT_LAYER, name: "默认图层", visible: true, locked: false, opacity: 1 }]
    ).map((layer) => new MarkLayer(layer));
    if (!this.getLayer(DEFAULT_LAYER)) {
      this.layerList.unshift(
        new MarkLayer({ id: DEFAULT_LAYER, name: "默认图层" })
      );
    }
    this.activeLayerId = this.getLayer(this.activeLayerId)
      ? this.activeLayerId
      : DEFAULT_LAYER;

    snapshot.objects.forEach((item) => {
      if (!item.type || !this.markMap[item.type]) return;
      if (!item.layerId || !this.getLayer(item.layerId)) {
        item.layerId = DEFAULT_LAYER;
      }
      const obj = this.markMap[item.type].import(this, item);
      this.markObjectList.push(obj);
    });
    this.markObjectList.forEach((obj, index) => {
      obj.index = index + 1;
    });
    this.renderAll();
    this.emit("onhistory", {
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      list: this.history.list,
      index: this.history.index,
    });
    this.emit("onlayerchange");
    this.emit("onchange");
  }

  /* ============================ 渲染能力 ============================ */

  /**
   * 清空绘制图形
   */
  clearMarkShapes() {
    this.runHistory("清空标注", () => {
      this.markObjectList.forEach((item) => {
        item.destory();
        item.render();
      });
      this.markObjectList = [];
      this.selectedIds = [];
      this.selectObject = undefined;
    });
    this.addObjectData();
  }

  /** 加载初始背景 */
  async setBackground(path: string) {
    return new Promise((resolve) => {
      if (this.img?.src) {
        this.img.src = path;
      } else {
        this.img = new Image();
        this.img.src = path;
        this.img.style.position = "absolute";
        this.img.style.userSelect = "none";
        this.img.style.pointerEvents = "none";
      }
      this.img.onload = () => {
        this.view.insertBefore(this.img, this.canvas);
        this.setLayout(this.img);
        resolve(null);
      };
    });
  }

  public handleResize() {
    // update canvas
    const { width: viewWidth, height: viewHeight } = this.viewDomInfo;
    this.canvas.width = viewWidth;
    this.canvas.height = viewHeight;
    this.regionCanvas.width = viewWidth;
    this.regionCanvas.height = viewHeight;
    this.canvas.style.width = viewWidth + "px";
    this.canvas.style.height = viewHeight + "px";
    this.regionCanvas.style.width = viewWidth + "px";
    this.regionCanvas.style.height = viewHeight + "px";
    // 2. img
    if (this.img) {
      this.setLayout({
        width: this.img.naturalWidth,
        height: this.img.naturalHeight,
      });
    } else {
      this.transfrom();
    }
  }
  /** transfrom board */
  transfrom() {
    MarkBoardUtils.applyDPR(this.ctx, this.canvas, this.t);
    MarkBoardUtils.applyDPR(this.regionCtx, this.regionCanvas, this.t);

    if (this.img) this.imgTrans();
    this.renderAll();
    this.emit("ontransform", { t: this.t });
  }
  setLayout({ width, height }: { width: number; height: number }) {
    let zoomx = this.viewDomInfo.width / width;
    let zoomy = this.viewDomInfo.height / height;
    let zoom = Math.min(zoomx, zoomy);
    let offsetx = (this.viewDomInfo.width - width * zoom) / 2;
    let offsety = (this.viewDomInfo.height - height * zoom) / 2;
    this.t = {
      a: zoom,
      b: 0,
      c: 0,
      d: zoom,
      e: offsetx,
      f: offsety,
    };
    this.initLayout = {
      zoom,
      offsetx,
      offsety,
      width: width,
      height: height,
    };
    this.transfrom();
  }
  imgTrans() {
    this.img.style.transformOrigin! = `${this.t.e}px ${this.t.f}px`;
    this.img.style.transform! = `scale(${this.t.a}) translate(${this.t.e}px,${this.t.f}px)`;
  }

  /** 渲染全部：主画布 + 交互层 */
  renderAll() {
    this.render();
    this.renderRegion();
  }

  /** 主画布：按图层顺序绘制已完成对象（隐藏图层跳过，透明度生效） */
  render() {
    for (var i = 0; i < this.renderGroup.length; i++) {
      this.renderGroup[i] = null;
    }
    this.renderGroup = [];
    this.clearCanvas(this.ctx);
    this.ctx.font = `bold ${~~(
      14 / this.t.a
    )}px  'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif`;
    this.ctx.lineWidth = this.config.lineWidth / this.t.a;
    this.layerList.forEach((layer) => {
      if (!layer.visible || layer.locked) return;
      this.ctx.save();
      this.ctx.globalAlpha = layer.opacity;
      this.markObjectList.forEach((item) => {
        if (item.layerId !== layer.id) return;
        if (item.status !== "done" && item.status !== "edit") return;
        if (this.config.showLabel) {
          this.ctx.fillStyle = item.color!;
          this.ctx.fillText(
            item.label + "",
            item.indexPoint.x,
            item.indexPoint.y - 4 / this.t.a
          );
        }
        this.ctx.strokeStyle = item.color!;
        let path = new Path2D(item.pathData);
        this.renderGroup.push(path);
        this.ctx.stroke(path);
      });
      this.ctx.restore();
    });
    // 兼容 layerId 已被删除的对象
    this.markObjectList.forEach((item) => {
      if (item.status === "draw" || this.getLayer(item.layerId)) return;
      if (this.config.showLabel) {
        this.ctx.fillStyle = item.color!;
        this.ctx.fillText(
          item.label + "",
          item.indexPoint.x,
          item.indexPoint.y - 4 / this.t.a
        );
      }
      this.ctx.strokeStyle = item.color!;
      let path = new Path2D(item.pathData);
      this.renderGroup.push(path);
      this.ctx.stroke(path);
    });
  }

  /** 交互层：选中高亮、顶点、绘制预览、框选矩形 */
  renderRegion() {
    this._frameToken++;
    this.regionFrame = this._frameToken;
    this.clearCanvas(this.regionCtx);
    // 选中对象（多选时主选显示顶点）
    this.selectedObjects.forEach((obj) => {
      if (obj === this.selectObject) {
        obj.render();
      } else {
        const { regionCtx: ctx, config } = this;
        ctx.lineWidth = config.lineWidth! / this.t.a;
        ctx.strokeStyle = obj.color!;
        const path = new Path2D(obj.pathData);
        ctx.stroke(path);
        ctx.fillStyle = config.fillColor!;
        ctx.fill(path);
      }
    });
    // 绘制中的预览
    const drawing = this.markObjectList.find(
      (item) => item.status === "draw"
    );
    if (drawing) drawing.render();
    // 框选矩形
    if (this.boxSelecting && this.boxSelectStart && this.boxSelectPoint) {
      const { regionCtx: ctx } = this;
      const start = this.boxSelectStart;
      const current = this.boxSelectPoint;
      ctx.save();
      ctx.lineWidth = 1 / this.t.a;
      ctx.setLineDash([6 / this.t.a, 4 / this.t.a]);
      ctx.strokeStyle = "#1677ff";
      ctx.fillStyle = "rgba(22,119,255,0.08)";
      ctx.beginPath();
      ctx.rect(
        start.x,
        start.y,
        current.x - start.x,
        current.y - start.y
      );
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ============================ 鼠标交互 ============================ */

  /** 缩放 */
  appWheel(e: WheelEvent) {
    if (this.config.disableZoom) return;
    if (e.metaKey || e.ctrlKey || e.altKey) {
      e.preventDefault();
      const center = { x: e.offsetX, y: e.offsetY };
      let scale = e.deltaY > 0 ? 0.9 : 1.1;
      scaleOfOuter(this.t, center, scale, scale);
      this.transfrom();
    }
  }
  /** 双击画布 */
  appDblclick() {
    this.t = {
      a: this.initLayout.zoom,
      b: 0,
      c: 0,
      d: this.initLayout.zoom,
      e: this.initLayout.offsetx,
      f: this.initLayout.offsety,
    };
    this.transfrom();
  }
  /** 平移事件 */
  appMoving(point: IPointData) {
    if (this.config.disableMove) return;
    this.view.style.cursor = "grab";
    let moveX = (point.x - this.lastMovePoint.x) * this.t.a;
    let moveY = (point.y - this.lastMovePoint.y) * this.t.a;
    this.t.e += moveX;
    this.t.f += moveY;
    this.transfrom();
    this.emit("onmove", { status: this.moveStatus });
  }

  /** 兼容旧 API：向绘制中的对象派发鼠标事件 */
  getDrawMark(
    method: "boxMousedown" | "boxMousemove" | "boxMouseup",
    point: IPointData
  ): void {
    this.dispatchDrawing(method, point);
  }

  /** 派发事件给绘制中的对象 */
  private dispatchDrawing(
    method: "boxMousedown" | "boxMousemove" | "boxMouseup",
    point: IPointData
  ) {
    const drawMark = this.markObjectList[this.markObjectList.length - 1];
    if (drawMark && drawMark.status == "draw") {
      drawMark[method](point);
    }
  }

  /** 画布鼠标移动 */
  appMousemove(e: MouseEvent) {
    let point = this.pointMapping(e);
    this.lastMovePoint = point;
    if (this.mouseDown && this.moveStatus) {
      this.appMoving(point);
      return;
    }

    this.view.style.cursor = "default";
    let drawStatus = !!this.markObjectList.find(
      (item) => item.status === "draw"
    );
    if (drawStatus) {
      this.view.style.cursor = "crosshair";
    }

    // 框选
    if (this.boxSelecting) {
      if (
        !this.boxSelectMoved &&
        this.boxSelectStart &&
        (Math.abs(point.x - this.boxSelectStart.x) > 2 / this.t.a ||
          Math.abs(point.y - this.boxSelectStart.y) > 2 / this.t.a)
      ) {
        this.boxSelectMoved = true;
      }
      this.boxSelectPoint = point;
      if (this.boxSelectMoved) {
        const hits = this.getObjectsInRect(this.boxSelectStart!, point);
        this.setSelectedLive(hits.map((item) => item.id));
      }
      this.view.style.cursor = "crosshair";
      this.renderRegion();
      return;
    }

    // 整体拖动（单选/多选）
    if (this.mouseDown && this.groupDrag && this.selectObject) {
      const offset = {
        x: point.x - this.dragStartPoint.x,
        y: point.y - this.dragStartPoint.y,
      };
      if (offset.x !== 0 || offset.y !== 0) this.dragMoved = true;
      this.dragStartPoint = point;
      this.selectedObjects.forEach((obj) => {
        obj.pointList = obj.pointList.map((p) => ({
          x: p.x + offset.x,
          y: p.y + offset.y,
        }));
      });
      this.view.style.cursor = "move";
      this.renderAll();
      return;
    }

    // 主选对象：hover 顶点高亮 / 顶点调整（整体拖动已在上面处理）
    if (this.selectObject) {
      if (
        this.mouseDown &&
        !this.groupDrag &&
        this.selectObject.acctivePointIndex !== -1
      ) {
        // 顶点拖动：把最新坐标交给对象
        this.selectObject.lastMousePoint = point;
      }
      this.selectObject.boxMousemove(point);
      this.renderRegion();
    }
    // 绘制预览
    this.dispatchDrawing("boxMousemove", point);
    if (this.mouseDown && this.selectObject) {
      this.drag = true;
    }
  }

  /** 框选过程中实时刷新选中态（不产生 onchange 抖动） */
  private setSelectedLive(ids: string[]) {
    const unique = Array.from(new Set(ids));
    this.selectedIds = unique;
    this.syncSelectObject();
    this.emit("onselect", this.selectedIds.slice());
  }

  /** 鼠标按下事件 */
  appMousedown(e: MouseEvent): void {
    let point = this.pointMapping(e);
    this.mouseDown = true;
    this.lastMovePoint = point;
    if (this.moveStatus) return;
    if (e.buttons !== 1 && e.button !== 0) return;

    const hit =
      e.shiftKey || !this.currentDrawingType
        ? this.getObjectAtPoint(point)
        : undefined;

    if (hit) {
      const alreadySelected = this.isSelected(hit.id);
      if (e.shiftKey) {
        // Shift 点选：增删选中，不开始拖动
        const ids = alreadySelected
          ? this.selectedIds.filter((id) => id !== hit.id)
          : this.selectedIds.concat(hit.id);
        this.setSelected(ids);
        return;
      }
      if (!alreadySelected) {
        this.setSelected([hit.id]);
      } else {
        this.syncSelectObject();
        this.setPrimary(hit.id);
      }
      // 判断是否点在主选对象的顶点上（顶点调整优先）
      hit.lastMousePoint = point;
      hit.mouseDown = true;
      const vertexIndex = MarkBoardUtils.getMinDistance(
        point,
        hit.vertexList || [],
        hit.expent,
        this.t.a
      );
      hit.acctivePointIndex = vertexIndex;
      if (vertexIndex === -1) {
        // 整体移动
        this.groupDrag = true;
        this.dragMoved = false;
        this.dragStartPoint = point;
        this.beginHistory("移动标注");
      } else {
        // 顶点调整
        this.beginHistory("移动标注");
      }
      hit.boxMousedown(point);
      this.renderAll();
      return;
    }

    // 空白区域
    if (e.shiftKey || !this.currentDrawingType) {
      // Shift 空白按下：不清空已有选择，仅开始框选（追加）
      this.boxSelectStart = point;
      this.boxSelectPoint = point;
      this.boxSelectMoved = false;
      this.boxSelecting = true;
      if (!e.shiftKey) {
        this.setSelected([]);
      }
      return;
    }

    // 绘制模式下空白按下：先清空选中，再走绘制
    if (this.selectedIds.length) {
      this.setSelected([]);
    }
    this.dispatchDrawing("boxMousedown", point);
  }

  private setPrimary(id: string) {
    const ids = this.selectedIds.filter((sid) => sid !== id);
    ids.unshift(id);
    this.selectedIds = ids;
    this.syncSelectObject();
  }

  /** 鼠标抬起事件 */
  appMouseup(e: MouseEvent) {
    let point = this.pointMapping(e);
    this.lastMovePoint = point;

    if (this.moveStatus) {
      this.moveStatus = false;
      this.mouseDown = false;
      return;
    }

    // 框选结束
    if (this.boxSelecting) {
      this.boxSelecting = false;
      this.boxSelectStart = null;
      this.boxSelectPoint = null;
      this.boxSelectMoved = false;
      this.mouseDown = false;
      this.syncSelectObject();
      this.renderAll();
      this.emit("onselect", this.selectedIds.slice());
      this.emit("onchange");
      return;
    }

    // 整体拖动 / 顶点调整结束
    const objectPressed =
      this.groupDrag || (this.mouseDown && this.selectObject?.mouseDown);
    if (objectPressed) {
      if (this.selectObject) {
        this.selectObject.mouseDown = false;
        this.selectObject.boxMouseup(point);
      }
      if (this.groupDrag) {
        this.groupDrag = false;
        if (this.dragMoved) {
          this.commitHistory();
        } else {
          this.cancelHistory();
        }
        this.dragMoved = false;
      } else {
        // 顶点调整：无变化的提交会被历史自动忽略
        this.commitHistory();
      }
      this.drag = false;
      this.mouseDown = false;
      this.renderAll();
      this.emit("onchange");
      return;
    }

    // 绘制对象的 mouseup（rect/circle 等）
    this.dispatchDrawing("boxMouseup", point);
    this.mouseDown = false;
    this.drag = false;
    this.renderAll();
    this.emit("onchange");
  }

  /** 计算相对底图的坐标点位 */
  pointMapping(point: MouseEvent): IPointData {
    let newPoint = { x: 0, y: 0 };
    let pointData = {
      x: point.offsetX || point.x,
      y: point.offsetY || point.y,
    };
    newPoint.x = (pointData.x - this.t.e) / this.t.a;
    newPoint.y = (pointData.y - this.t.f) / this.t.a;
    return newPoint;
  }

  /* ============================ 标注对象管理 ============================ */

  /** 设置绘制模式 */
  async setDrawType(type: IMarkBoardDrawType) {
    if (this.currentDrawingType) {
      let obj = this.markObjectList[this.markObjectList.length - 1];
      if (obj && obj.status === "draw") {
        obj?.destory();
        this.markObjectList.pop();
      }
    }
    this.currentDrawingType = type;
    this.addObjectData();
    this.emit("ondraw", { type });
  }
  /** 获取标注对象 */
  get objects(): IMarkObjectInfo[] {
    return this.markObjectList
      .filter((item) => item.status !== "draw")
      .map((obj) => {
        return {
          id: obj.id,
          label: obj.label,
          type: obj.type,
          color: obj.color,
          select: obj.isSelected,
          layerId: obj.layerId,
          pointList: obj.resultPoints || obj.pointList,
          rotation: obj.rotation,
        };
      });
  }
  /** 添加标注对象（绘制中的新对象） */
  public addObjectData() {
    let obj: MarkObject | null = null;
    if (this.currentDrawingType) {
      try {
        obj = new this.markMap[this.currentDrawingType](this);
      } catch (err) {
        throw new Error(
          `${this.currentDrawingType} mark type is not supported`
        );
      }
    }

    obj && this.markObjectList.push(obj as MarkObject);
    this.emit("onchange");
  }

  /** 通过数据实例化对象 */
  private instantiate(item: IMarkObjectJSON): MarkObject | null {
    if (!item.type || !this.markMap[item.type]) return null;
    const data: IMarkObjectJSON = {
      ...item,
      layerId:
        item.layerId && this.getLayer(item.layerId)
          ? item.layerId
          : DEFAULT_LAYER,
    };
    try {
      return this.markMap[item.type].import(this, data);
    } catch (err) {
      throw new Error(`${item.type} mark type is not supported`);
    }
  }

  /**
   * 设置标注对象（兼容旧 API：追加导入，不进历史）
   * 新场景建议使用 importData
   */
  public setObjectData(list: IMarkObjectJSON[]) {
    // 移除所有绘制中的草稿（单点图形完成后会立刻产生新草稿）
    this.markObjectList
      .filter((item) => item.status === "draw")
      .forEach((item) => item.destory());
    this.markObjectList = this.markObjectList.filter(
      (item) => item.status !== "draw"
    );
    list.forEach((item) => {
      const obj = this.instantiate(item);
      if (obj) this.markObjectList.push(obj);
    });
    this.markObjectList.forEach((obj, index) => {
      obj.index = index + 1;
    });
    this.renderAll();
    this.addObjectData();
    this.emit("onchange");
  }

  /** 导出全部数据（图层 + 对象） */
  exportData(): IMarkBoardJSON {
    return {
      layers: this.layerList.map((layer) => layer.toJSON()),
      objects: this.markObjectList
        .filter((item) => item.status !== "draw")
        .map((item) => item.export()),
    };
  }

  /**
   * 导入完整数据，进入历史。
   * 兼容：
   * - 数组：纯对象列表（沿用当前图层）
   * - { layers, objects }：完整数据
   */
  importData(
    data: IMarkBoardJSON | IMarkObjectJSON[],
    options?: { append?: boolean }
  ) {
    const isFull = !Array.isArray(data);
    const layers = isFull
      ? (data as IMarkBoardJSON).layers || []
      : [];
    const objects = (
      isFull ? (data as IMarkBoardJSON).objects : (data as IMarkObjectJSON[])
    ) || [];
    this.runHistory("导入数据", () => {
      if (!options?.append) {
        // 终止并清空全部对象（含绘制中的草稿，dot 等单点图形完成后会立即产生新草稿）
        this.markObjectList.forEach((item) => item.destory());
        this.markObjectList = [];
        this.selectedIds = [];
        this.selectObject = undefined;
      } else {
        // 追加模式下仅移除草稿
        this.markObjectList
          .filter((item) => item.status === "draw")
          .forEach((item) => item.destory());
        this.markObjectList = this.markObjectList.filter(
          (item) => item.status !== "draw"
        );
      }
      if (!options?.append && isFull && layers.length) {
        this.layerList = layers.map((layer) => new MarkLayer(layer));
        if (!this.getLayer(DEFAULT_LAYER)) {
          this.layerList.unshift(
            new MarkLayer({ id: DEFAULT_LAYER, name: "默认图层" })
          );
        }
        if (!this.getLayer(this.activeLayerId)) {
          this.activeLayerId = DEFAULT_LAYER;
        }
      }
      objects.forEach((item) => {
        const obj = this.instantiate(item);
        if (obj) this.markObjectList.push(obj);
      });
      this.markObjectList.forEach((obj, index) => {
        obj.index = index + 1;
      });
    });
    this.addObjectData();
  }

  /** 设置单个对象标签/颜色 */
  setObject(id: IMarkObjectId, data: IObjectLabelData) {
    let obj = this.markObjectList.find((item) => item.id === id);
    if (obj) {
      obj.setData(data);
    }
  }

  /** 批量修改选中对象（或指定 id 列表）的标签/颜色 */
  setObjectsData(data: IObjectLabelData, ids?: IMarkObjectId[]) {
    const targetIds = ids || this.selectedIds;
    if (!targetIds.length) return;
    this.runHistory(
      data.color !== undefined && data.label === undefined
        ? "批量改颜色"
        : "批量改标签",
      () => {
        targetIds.forEach((id) => {
          const obj = this.markObjectList.find((item) => item.id === id);
          if (obj) {
            if (data.label !== undefined) obj.label = data.label;
            if (data.color !== undefined) obj.color = data.color;
          }
        });
      },
      data.color !== undefined && data.label === undefined
        ? undefined
        : `label:${targetIds.slice().sort().join(",")}`
    );
  }

  /** 修改对象图层归属（进历史），默认操作当前选中 */
  setObjectLayer(layerId: string, ids?: IMarkObjectId[]) {
    if (!this.getLayer(layerId)) return;
    const targetIds = (ids || this.selectedIds).slice();
    if (!targetIds.length) return;
    const idSet = new Set(targetIds);
    this.runHistory("移动到图层", () => {
      this.markObjectList.forEach((obj) => {
        if (idSet.has(obj.id)) obj.layerId = layerId;
      });
    });
  }

  /** 选中对象ID */
  public selectObjectById(id: IMarkObjectId) {
    let obj = this.markObjectList.find((item) => item.id === id);
    if (obj && obj.layerEditable) obj.setSelect();
  }

  /** 删除对象（单个，进历史） */
  public deleteObject(id: IMarkObjectId) {
    this.deleteObjects([id]);
  }

  /** 批量删除对象（进历史，默认删除当前选中） */
  public deleteObjects(ids?: IMarkObjectId[]) {
    const targetIds = (ids || this.selectedIds).slice();
    if (!targetIds.length) return;
    this.runHistory("删除标注", () => {
      const idSet = new Set(targetIds);
      const removed = this.markObjectList.filter((item) =>
        idSet.has(item.id)
      );
      removed.forEach((item) => item.destory());
      this.markObjectList = this.markObjectList.filter(
        (item) => !idSet.has(item.id)
      );
      this.markObjectList.forEach((obj, index) => {
        obj.index = index + 1;
      });
      this.selectedIds = this.selectedIds.filter(
        (id) => !idSet.has(id)
      );
      if (this.selectObject && idSet.has(this.selectObject.id)) {
        this.selectObject = undefined;
      }
    });
  }

  /** 复制选中对象到内部剪贴板 */
  copy() {
    const data = this.selectedObjects.map((obj) => obj.export());
    if (data.length) {
      this._clipboard = data;
      this.emit("oncopy", data);
    }
    return data;
  }
  private _clipboard: IMarkObjectJSON[] = [];

  /** 粘贴：基于剪贴板生成新 id，并偏移位置 */
  paste(offset: number = 15) {
    if (!this._clipboard.length) return [];
    const newObjects: IMarkObjectJSON[] = [];
    const before = this.getSnapshot();
    let created: MarkObject[] = [];
    const targetLayerId = this.getActiveLayerIdForNew();
    this._clipboard.forEach((item) => {
      const clone: IMarkObjectJSON = {
        ...item,
        id: undefined,
        layerId:
          item.layerId && this.getLayer(item.layerId)
            ? item.layerId
            : targetLayerId,
        pointList: (item.pointList || []).map((point) => ({
          x: point.x + offset,
          y: point.y + offset,
        })),
      };
      // 新 id
      const newId = MarkBoardUtils.getUUID();
      const obj = this.instantiate({ ...clone, id: newId });
      if (obj) {
        this.markObjectList.push(obj);
        created.push(obj);
        newObjects.push(obj.export());
      }
    });
    this.markObjectList.forEach((obj, index) => {
      obj.index = index + 1;
    });
    const after = this.getSnapshot();
    this.history.push("粘贴标注", before, after);
    this.setSelected(created.map((obj) => obj.id));
    this.afterHistoryChange();
    return newObjects;
  }

  /** 设置移动状态 */
  public setMoveEditStatus(status: boolean) {
    if (this.moveStatus == status) return;
    this.moveStatus = status;
  }

  private isEditableEventTarget(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement | null;
    if (!target) return false;
    const tag = target.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target.isContentEditable
    );
  }

  /** 键盘按下 */
  async windowKeydown(e: KeyboardEvent) {
    if (this.isEditableEventTarget(e)) return;
    const meta = e.ctrlKey || e.metaKey;
    if (e.code == "Space") {
      this.setMoveEditStatus(true);
      e.preventDefault();
    }
    if (e.code == "NumpadEnter" || e.code == "Enter") {
      let obj = this.markObjectList[this.markObjectList.length - 1];
      if (obj?.status == "draw") {
        await obj.complete();
      }
    }
    if (meta && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
      return;
    }
    if (meta && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      this.redo();
      return;
    }
    if (meta && (e.key === "c" || e.key === "C")) {
      if (this.selectedIds.length) {
        e.preventDefault();
        this.copy();
      }
      return;
    }
    if (meta && (e.key === "v" || e.key === "V")) {
      if (this._clipboard.length) {
        e.preventDefault();
        this.paste();
      }
      return;
    }
    if (meta && (e.key === "a" || e.key === "A")) {
      e.preventDefault();
      this.selectAll();
      return;
    }
    if (e.code == "Delete" || e.code === "Backspace") {
      // 删除选中的标注对象
      if (this.selectedIds.length) {
        e.preventDefault();
        this.deleteObjects();
      }
    }
    if (e.code === "Escape") {
      // 优先取消绘制，再取消选中、框选
      const drawing = this.markObjectList.find(
        (item) => item.status === "draw"
      );
      if (drawing) {
        this.cancelDrawing();
      } else if (this.boxSelecting) {
        this.boxSelecting = false;
        this.boxSelectStart = null;
        this.boxSelectPoint = null;
      } else if (this.selectedIds.length) {
        this.clearSelection();
      }
      this.setMoveEditStatus(false);
    }
  }
  /** 键盘抬起 */
  windowKeyup(e: KeyboardEvent) {
    if (e.code == "Space") {
      this.setMoveEditStatus(false);
    }
  }

  destroy() {
    window.removeEventListener("keydown", this.windowKeydown);
    window.removeEventListener("keyup", this.windowKeyup);
    this.view.innerHTML = "";
    this.view.replaceWith(this.view.cloneNode(true));
  }

  _events: IObject = Object.create(null);
  on(_type: string, _listener: IEventListener): void {}
  on_(
    _type: string,
    _listener: IEventListener,
    _bind?: IObject
  ): IEventListenerId {
    return {} as IEventListenerId;
  }
  off(_type: string, _listener: IFunction): void {}
  off_(_id: IEventListenerId | IEventListenerId[]): void {}
  emit(_type: string, ..._args: any[]) {}
}
// trick Class Decorator Mutation  https://github.com/Microsoft/TypeScript/issues/4881
