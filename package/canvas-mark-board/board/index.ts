import { Eventer } from "../decorator/event";
import { useModule } from "../decorator/rewrite";
import { markMap, MarkObject, MarkObjectType } from "../object/index";
import ClickMarkObject from "../object/clickMark";
import MoveMarkObject from "../object/moveMark";
import * as MarkBoardUtils from "../utils";
import { getUUID } from "../utils";
const { scaleOfOuter } = MarkBoardUtils.MatrixHelper;

import type {
  ICanvasMarkBoard,
  IMarkBoardConfig,
  IMarkBoardData,
  IMatrixData,
  IMarkBoardDrawType,
  IPointData,
  IMarkObjectInfo,
  IMarkObjectId,
  IMarkLayer,
  IHistorySnapshot,
  IObject,
  IEventListenerId,
  IEventListener,
  IMarkObjectJSON,
  IFunction,
  IObjectLabelData,
} from "../types";

/** 创建默认图层 */
function createDefaultLayer(): IMarkLayer {
  return {
    id: "default",
    name: "默认图层",
    visible: true,
    locked: false,
    opacity: 1,
  };
}

@useModule(Eventer)
export default class CanvasMarkBoard implements ICanvasMarkBoard {
  static MoveMarkObject = MoveMarkObject;
  static ClickMarkObject = ClickMarkObject;
  static MarkBoardUtils = MarkBoardUtils;

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
  // 拖拽状态
  drag = false;
  /** 选中标注对象 */
  selectObject?: MarkObject;
  /** 多选标注对象（包含 selectObject） */
  selectObjects: MarkObject[] = [];
  currentDrawingType: IMarkBoardDrawType = MarkObjectType.NONE;
  markObjectList: MarkObject[] = [];
  renderGroup: any[] = [];
  markMap: any = markMap;
  /** 图层列表（自下而上） */
  layerList: IMarkLayer[] = [];
  /** 当前活动图层ID */
  activeLayerId: string = "";
  /** 剪贴板 */
  clipboard: IMarkObjectJSON[] = [];
  /** 粘贴次数（用于粘贴偏移） */
  pasteCount: number = 0;
  /** 撤销栈 */
  historyUndo: IHistorySnapshot[] = [];
  /** 重做栈 */
  historyRedo: IHistorySnapshot[] = [];
  /** 历史栈上限 */
  historyLimit: number = 50;
  /** 正在恢复历史（不记录） */
  restoring: boolean = false;
  /** 框选状态 */
  boxSelecting: boolean = false;
  boxSelectStart: IPointData = { x: 0, y: 0 };
  boxSelectEnd: IPointData = { x: 0, y: 0 };
  /** 拖拽前快照 */
  dragSnapshot: IHistorySnapshot | null = null;
  /** 本次拖拽参与批量移动的对象 */
  dragObjects: MarkObject[] = [];
  /** 初始化标注画布 */
  constructor(config: IMarkBoardConfig) {
    this.init(config);
  }
  init(config: IMarkBoardConfig) {
    // 合并配置
    Object.assign(this.config, config || {});
    // 初始化默认图层
    if (!this.layerList.length) {
      const defaultLayer = createDefaultLayer();
      this.layerList = [defaultLayer];
      this.activeLayerId = defaultLayer.id;
    }
    this.view = document.querySelector(config.view)!;
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
   * todo 优化clear canvas，暂时
   */
  clearCanvas(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }
  /**
   * 清空绘制图形
   */
  clearMarkShapes() {
    this.pushHistory();
    this.markObjectList.forEach((item) => {
      item.destory();
      item.render();
    });
    this.markObjectList = [];
    this.selectObject = undefined;
    this.selectObjects = [];
    this.render();
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
    this.selectObject?.render();
    this.render();
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
  /** todo:
   * 1. 优化全部渲染
   * 2. 优化字体和devicePixelRatio显示
   **/
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
    this.getRenderObjects().map((item) => {
      const layer = this.getObjectLayer(item);
      // 隐藏图层不参与绘制
      if (layer && !layer.visible) return;
      this.ctx.save();
      this.ctx.globalAlpha = layer ? layer.opacity : 1;
      if (item.status !== "draw" && this.config.showLabel) {
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
      // 多选高亮
      if (item.status !== "draw" && this.selectObjects.includes(item)) {
        this.ctx.save();
        this.ctx.setLineDash([6 / this.t.a, 4 / this.t.a]);
        this.ctx.strokeStyle = "#1677ff";
        this.ctx.stroke(path);
        this.ctx.restore();
      }
      this.ctx.restore();
    });
  }

  /** 获取按图层顺序（自下而上）排序后的对象列表 */
  getRenderObjects(): MarkObject[] {
    const order = new Map(this.layerList.map((layer, i) => [layer.id, i]));
    return this.markObjectList
      .map((obj, idx) => ({ obj, idx }))
      .sort((a, b) => {
        const la = order.get(a.obj.layerId) ?? 0;
        const lb = order.get(b.obj.layerId) ?? 0;
        return la - lb || a.idx - b.idx;
      })
      .map((item) => item.obj);
  }

  /* ------------------------------ 图层管理 ------------------------------ */
  /** 获取图层 */
  getLayer(id: string): IMarkLayer | undefined {
    return this.layerList.find((layer) => layer.id === id);
  }
  /** 获取对象所属图层（未知归属时回退到默认图层） */
  getObjectLayer(obj: MarkObject): IMarkLayer | undefined {
    return this.getLayer(obj.layerId) || this.layerList[0];
  }
  /** 图层是否可见 */
  isLayerVisible(layerId: string): boolean {
    const layer = this.getLayer(layerId) || this.layerList[0];
    return layer ? layer.visible : true;
  }
  /** 对象是否可交互（所在图层可见且未锁定） */
  isObjectInteractable(obj: MarkObject): boolean {
    const layer = this.getObjectLayer(obj);
    return !!layer && layer.visible && !layer.locked;
  }
  /** 图层列表（只读副本） */
  get layers(): IMarkLayer[] {
    return this.layerList.map((layer) => ({ ...layer }));
  }
  /** 新增图层 */
  addLayer(name?: string): IMarkLayer {
    this.pushHistory();
    const layer: IMarkLayer = {
      id: getUUID(),
      name: name || `图层 ${this.layerList.length + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
    };
    this.layerList.push(layer);
    this.activeLayerId = layer.id;
    this.afterLayerChange();
    return { ...layer };
  }
  /** 删除图层（同时删除图层上的标注对象） */
  removeLayer(id: string) {
    if (this.layerList.length <= 1) return;
    const index = this.layerList.findIndex((layer) => layer.id === id);
    if (index === -1) return;
    this.pushHistory();
    this.layerList.splice(index, 1);
    // 删除该图层上的对象
    this.markObjectList
      .filter((obj) => obj.layerId === id)
      .forEach((obj) => obj.destory());
    this.markObjectList = this.markObjectList.filter(
      (obj) => obj.layerId !== id
    );
    if (this.activeLayerId === id) {
      this.activeLayerId =
        this.layerList[Math.max(0, index - 1)]?.id || this.layerList[0].id;
    }
    this.clearInvalidSelection();
    // 绘制中的对象随图层删除时，重建绘制对象
    const last = this.markObjectList[this.markObjectList.length - 1];
    if (this.currentDrawingType && (!last || last.status !== "draw")) {
      this.addObjectData();
    }
    this.afterLayerChange();
  }
  /** 更新图层（名称/显隐/锁定/透明度） */
  updateLayer(id: string, data: Partial<Omit<IMarkLayer, "id">>) {
    const layer = this.getLayer(id);
    if (!layer) return;
    // 无实际变更时不记录历史
    const changed = Object.keys(data).some(
      (key) => (layer as IObject)[key] !== (data as IObject)[key]
    );
    if (!changed) return;
    this.pushHistory();
    Object.assign(layer, data);
    // 隐藏或锁定后，该图层对象不再参与选中与编辑
    if (data.visible === false || data.locked === true) {
      this.clearInvalidSelection();
      // 活动图层被隐藏/锁定时，清除绘制中的对象
      if (id === this.activeLayerId) {
        const last = this.markObjectList[this.markObjectList.length - 1];
        if (last && last.status === "draw") {
          last.destory();
          this.markObjectList.pop();
        }
      }
    }
    this.afterLayerChange();
  }
  /** 图层排序（toIndex 为 layerList 中的目标位置，自下而上） */
  moveLayer(id: string, toIndex: number) {
    const fromIndex = this.layerList.findIndex((layer) => layer.id === id);
    if (fromIndex === -1) return;
    const clamped = Math.max(0, Math.min(this.layerList.length - 1, toIndex));
    if (clamped === fromIndex) return;
    this.pushHistory();
    const [layer] = this.layerList.splice(fromIndex, 1);
    this.layerList.splice(clamped, 0, layer);
    this.afterLayerChange();
  }
  /** 设置当前活动图层（新绘制的对象归入该图层） */
  setActiveLayer(id: string) {
    if (!this.getLayer(id) || this.activeLayerId === id) return;
    this.activeLayerId = id;
    // 绘制中的对象跟随活动图层
    const drawObj = this.markObjectList[this.markObjectList.length - 1];
    if (drawObj && drawObj.status === "draw") {
      drawObj.layerId = id;
    }
    this.emit("onlayerchange");
  }
  /** 图层变更后 */
  afterLayerChange() {
    this.render();
    this.emit("onlayerchange");
    this.emit("onchange");
  }
  /** 清理失效的选中（对象被删除或所在图层隐藏/锁定） */
  clearInvalidSelection() {
    this.selectObjects = this.selectObjects.filter(
      (obj) =>
        this.markObjectList.includes(obj) && this.isObjectInteractable(obj)
    );
    if (
      this.selectObject &&
      (!this.markObjectList.includes(this.selectObject) ||
        !this.isObjectInteractable(this.selectObject))
    ) {
      this.selectObject.status = "done";
      this.selectObject = undefined;
      this.clearCanvas(this.regionCtx);
    }
    if (this.selectObject && !this.selectObjects.includes(this.selectObject)) {
      this.selectObjects = [this.selectObject];
    }
  }

  /* ------------------------------ 撤销/重做 ------------------------------ */
  /** 当前状态快照 */
  snapshot(): IHistorySnapshot {
    return {
      objects: this.markObjectList
        .filter((obj) => obj.status !== "draw")
        .map((obj) => this.exportObject(obj)),
      layers: this.layerList.map((layer) => ({ ...layer })),
      activeLayerId: this.activeLayerId,
    };
  }
  /** 记录历史（在变更之前调用） */
  pushHistory(snap?: IHistorySnapshot) {
    if (this.restoring) return;
    this.historyUndo.push(snap || this.snapshot());
    if (this.historyUndo.length > this.historyLimit) {
      this.historyUndo.shift();
    }
    this.historyRedo = [];
    this.emit("onhistorychange");
  }
  /** 撤销 */
  undo() {
    if (!this.historyUndo.length) return;
    this.historyRedo.push(this.snapshot());
    const snap = this.historyUndo.pop()!;
    this.restore(snap);
  }
  /** 重做 */
  redo() {
    if (!this.historyRedo.length) return;
    this.historyUndo.push(this.snapshot());
    const snap = this.historyRedo.pop()!;
    this.restore(snap);
  }
  /** 恢复快照 */
  restore(snap: IHistorySnapshot) {
    this.restoring = true;
    this.markObjectList.forEach((obj) => obj.destory());
    this.markObjectList = [];
    this.layerList = snap.layers.map((layer) => ({ ...layer }));
    if (!this.layerList.length) {
      this.layerList = [createDefaultLayer()];
    }
    this.activeLayerId = this.getLayer(snap.activeLayerId)
      ? snap.activeLayerId
      : this.layerList[0].id;
    snap.objects.forEach((json) => {
      const obj = this.importObject(json);
      obj && this.markObjectList.push(obj);
    });
    this.selectObject = undefined;
    this.selectObjects = [];
    this.clearCanvas(this.regionCtx);
    // 重建绘制中的对象
    this.addObjectData();
    this.render();
    this.restoring = false;
    this.emit("onchange");
    this.emit("onlayerchange");
    this.emit("onhistorychange");
  }
  /** 拖拽结束时如有变更则记录历史 */
  commitDragSnapshot() {
    if (!this.dragSnapshot) return;
    const before = JSON.stringify(this.dragSnapshot.objects);
    const after = JSON.stringify(this.snapshot().objects);
    if (before !== after) {
      this.pushHistory(this.dragSnapshot);
    }
    this.dragSnapshot = null;
  }

  /* ------------------------------ 复制/粘贴 ------------------------------ */
  /** 复制选中的标注对象 */
  copySelection() {
    const list = this.selectObjects.length
      ? this.selectObjects
      : this.selectObject
      ? [this.selectObject]
      : [];
    const objects = list.filter((obj) => obj.status !== "draw");
    if (!objects.length) return;
    this.clipboard = objects.map((obj) => this.exportObject(obj));
    this.pasteCount = 0;
  }
  /** 粘贴标注对象 */
  paste() {
    if (!this.clipboard.length) return;
    this.pushHistory();
    this.pasteCount += 1;
    const offset = (10 / this.t.a) * this.pasteCount;
    const pasted: MarkObject[] = [];
    this.clipboard.forEach((json) => {
      const data: IMarkObjectJSON = {
        ...json,
        id: undefined,
        pointList: json.pointList.map((point) => ({
          x: point.x + offset,
          y: point.y + offset,
        })),
        // 原图层已删除时归入当前活动图层
        layerId: this.getLayer(json.layerId || "")
          ? json.layerId
          : this.activeLayerId,
      };
      const obj = this.importObject(data);
      if (obj) {
        this.markObjectList.push(obj);
        pasted.push(obj);
      }
    });
    // 选中粘贴结果
    if (this.selectObject) {
      this.selectObject.status = "done";
      this.selectObject.render();
    }
    this.selectObjects = pasted;
    this.selectObject = pasted[pasted.length - 1];
    if (this.selectObject) {
      this.selectObject.status = "edit";
      this.selectObject.render();
    }
    this.render();
    this.emit("onchange");
  }

  /* ------------------------------ 多选/框选 ------------------------------ */
  /** Shift 点选切换 */
  toggleSelectObject(obj: MarkObject) {
    const index = this.selectObjects.indexOf(obj);
    if (index > -1) {
      this.selectObjects.splice(index, 1);
      if (this.selectObject === obj) {
        obj.status = "done";
        obj.render();
        this.selectObject = this.selectObjects[this.selectObjects.length - 1];
        if (this.selectObject) {
          this.selectObject.status = "edit";
          this.selectObject.render();
        }
      }
    } else {
      if (this.selectObject && this.selectObject !== obj) {
        this.selectObject.status = "done";
      }
      this.selectObjects.push(obj);
      this.selectObject = obj;
      obj.status = "edit";
      obj.render();
    }
    this.render();
  }
  /** 绘制框选矩形 */
  drawBoxSelect() {
    const ctx = this.regionCtx;
    this.clearCanvas(ctx);
    const { boxSelectStart: start, boxSelectEnd: end } = this;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(start.x - end.x);
    const h = Math.abs(start.y - end.y);
    ctx.save();
    ctx.lineWidth = 1 / this.t.a;
    ctx.strokeStyle = "#1677ff";
    ctx.setLineDash([4 / this.t.a, 4 / this.t.a]);
    ctx.fillStyle = "rgba(22, 119, 255, 0.08)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }
  /** 结束框选 */
  finishBoxSelect() {
    const { boxSelectStart: start, boxSelectEnd: end } = this;
    const minx = Math.min(start.x, end.x);
    const miny = Math.min(start.y, end.y);
    const maxx = Math.max(start.x, end.x);
    const maxy = Math.max(start.y, end.y);
    this.boxSelecting = false;
    this.clearCanvas(this.regionCtx);
    const hits = this.getRenderObjects().filter((obj) => {
      if (obj.status === "draw" || !this.isObjectInteractable(obj)) {
        return false;
      }
      return obj.pointList.some(
        (point) =>
          point.x >= minx && point.x <= maxx && point.y >= miny && point.y <= maxy
      );
    });
    if (this.selectObject && !hits.includes(this.selectObject)) {
      this.selectObject.status = "done";
      this.selectObject.render();
    }
    this.selectObjects = hits;
    this.selectObject = hits[hits.length - 1];
    if (this.selectObject) {
      this.selectObject.status = "edit";
      this.selectObject.render();
    }
    this.render();
    this.emit("onchange");
  }
  /** 取消当前绘制与选中（Esc） */
  cancel() {
    const drawObj = this.markObjectList[this.markObjectList.length - 1];
    if (drawObj && drawObj.status === "draw" && drawObj.pointList.length) {
      drawObj.pointList = [];
      drawObj.render();
    }
    if (this.boxSelecting) {
      this.boxSelecting = false;
      this.clearCanvas(this.regionCtx);
    }
    if (this.selectObject) {
      this.selectObject.status = "done";
      this.selectObject.render();
      this.selectObject = undefined;
    }
    this.selectObjects = [];
    this.render();
    this.emit("onchange");
  }

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
  /** 画布鼠标移动 */
  appMousemove(e: MouseEvent) {
    let point = this.pointMapping(e);
    if (this.mouseDown && this.moveStatus) {
      this.appMoving(point);
      this.lastMovePoint = this.pointMapping(e);
      return;
    }
    // 框选中
    if (this.boxSelecting) {
      this.boxSelectEnd = point;
      this.drawBoxSelect();
      this.lastMovePoint = { x: point.x, y: point.y };
      return;
    }

    this.view.style.cursor = "default";
    // 绘制状态

    let drawStatus = !!this.markObjectList.find(
      (item) => item.status === "draw"
    );
    // 根据状态设置光标
    if (drawStatus) {
      this.view.style.cursor = "crosshair";
    }
    if (this.mouseDown && this.selectObject) {
      this.drag = true;
      this.view.style.cursor = "move";
    }
    // 批量移动
    if (this.mouseDown && this.drag && this.dragObjects.length > 1) {
      let offset = {
        x: point.x - this.lastMovePoint.x,
        y: point.y - this.lastMovePoint.y,
      };
      this.dragObjects.forEach((obj) => {
        obj.pointList = obj.pointList.map((p) => ({
          x: p.x + offset.x,
          y: p.y + offset.y,
        }));
      });
      this.selectObject?.render();
      this.render();
      this.lastMovePoint = { x: point.x, y: point.y };
      return;
    }

    e.buttons !== undefined &&
      (this.lastMovePoint = { x: point.x, y: point.y }),
      this.getDrawMark("boxMousemove", point);
  }
  /** 鼠标按下事件 */
  appMousedown(e: MouseEvent): void {
    let point = this.pointMapping(e);
    this.mouseDown = true;
    if (this.moveStatus) return;
    if (e.buttons === 1) {
      // 记录拖拽前快照（移动/顶点编辑进入历史）
      this.dragSnapshot = this.snapshot();
      // 批量移动对象：按下的对象在多选集合中
      let hit = this.getSelectedObject(point);
      this.dragObjects =
        hit && this.selectObjects.includes(hit) && this.selectObjects.length > 1
          ? [...this.selectObjects]
          : [];
      // 选择模式下点击空白处开始框选
      if (!this.currentDrawingType && !hit) {
        this.boxSelecting = true;
        this.boxSelectStart = point;
        this.boxSelectEnd = point;
        return;
      }
      this.getDrawMark("boxMousedown", point);
    }
  }
  /**绘制的和选中的才触发事件 */
  getDrawMark(
    method: "boxMousedown" | "boxMousemove" | "boxMouseup",
    point: IPointData
  ): void {
    if (this.selectObject) {
      this.selectObject[method](point);
    }
    const drawMark = this.markObjectList[this.markObjectList.length - 1];
    if (drawMark && drawMark.status == "draw") {
      this.markObjectList?.[this.markObjectList.length - 1]?.[method](point);
    }
    return;
  }
  /** 鼠标抬起事件 */
  appMouseup(e: MouseEvent) {
    this.mouseDown = false;
    if (this.moveStatus) return;
    let point = this.pointMapping(e);
    // 框选结束
    if (this.boxSelecting) {
      this.boxSelectEnd = point;
      this.finishBoxSelect();
      this.dragSnapshot = null;
      return;
    }
    // 批量移动结束
    if (this.drag && this.dragObjects.length > 1) {
      this.drag = false;
      this.dragObjects = [];
      this.commitDragSnapshot();
      this.getDrawMark("boxMouseup", point);
      this.emit("onchange");
      return;
    }
    // 如果有选中并且在里面
    // TODO: 优化一下
    if (this.selectObject && this.drag) {
      if (
        !this.selectObject.isPointInside(point) &&
        this.selectObject.acctivePointIndex === -1
      ) {
        this.selectObject = undefined;
        this.selectObjects = [];
      }
      this.drag = false;
      this.commitDragSnapshot();
      this.getDrawMark("boxMouseup", point);
      this.emit("onchange");
      return;
    }
    let lastMark = this.markObjectList[this.markObjectList.length - 1];
    if (
      lastMark &&
      lastMark.status === "draw" &&
      lastMark.pointList &&
      this.lastMovePoint?.x !== lastMark?.pointList?.[0]?.x &&
      lastMark.pointList.length > 0 &&
      lastMark?.pointList?.[0]?.x !== lastMark?.pointList?.[1]?.x
    ) {
      this.selectObject = undefined;
      this.selectObjects = [];
    } else {
      let hit = this.getSelectedObject(point);
      if (e.shiftKey) {
        // Shift 点选切换多选
        if (hit && hit.status !== "draw") {
          this.toggleSelectObject(hit);
        }
      } else if (hit) {
        if (
          this.drag &&
          this.selectObject &&
          this.selectObject.id !== hit.id
        ) {
        } else {
          this.selectObject = hit;
        }
        // 如果是正在绘制的
        if (hit.status === "draw") {
          this.selectObject = undefined;
        }
      } else {
        this.selectObject = undefined;
      }
      if (!e.shiftKey) {
        this.selectObjects = this.selectObject ? [this.selectObject] : [];
      }
    }
    this.moveStatus = false;
    this.mouseDown = false;
    this.drag = false;
    this.dragSnapshot = null;
    this.getDrawMark("boxMouseup", point);
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
  /** 获取选中的图形的index */
  getSelectedIndex(point: IPointData) {
    let obj = this.getSelectedObject(point);
    return obj ? this.markObjectList.indexOf(obj) : undefined;
  }
  /** 获取点位命中的可交互对象（隐藏/锁定图层不参与点选） */
  getSelectedObject(point: IPointData): MarkObject | undefined {
    // 按图层顺序自下而上，倒序后最上层优先
    let hits = this.getRenderObjects()
      .reverse()
      .filter((obj) => {
        return this.isObjectInteractable(obj) && obj.isPointInside(point);
      });
    if (!hits.length) return undefined;
    // 只有一个 直接返回
    if (hits.length === 1) return hits[0];
    // 大于1, 穿透
    if (this.drag && this.selectObject) {
      return this.selectObject;
    }
    if (this.selectObject) {
      const oldIndex = hits.indexOf(this.selectObject);
      if (oldIndex > -1 && oldIndex + 1 < hits.length) {
        return hits[oldIndex + 1];
      }
    }
    return hits[0];
  }
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
          select: obj.id === this.selectObject?.id,
          pointList: obj.resultPoints || obj.pointList,
          rotation: obj.rotation,
          layerId: obj.layerId,
        };
      });
  }
  /** 添加标注对象 */
  public addObjectData() {
    let obj = null;
    if (this.currentDrawingType) {
      // 活动图层隐藏或锁定时不参与绘制
      const activeLayer = this.getLayer(this.activeLayerId);
      if (activeLayer && (!activeLayer.visible || activeLayer.locked)) {
        this.emit("onchange");
        return;
      }
      try {
        obj = new this.markMap[this.currentDrawingType](this);
      } catch (err) {
        throw new Error(
          `${this.currentDrawingType} mark type is not supported`
        );
      }
      if (obj) {
        obj.layerId = this.activeLayerId;
      }
    }

    obj && this.markObjectList.push(obj);
    this.emit("onchange");
  }
  /** 导出单个标注对象 */
  exportObject(obj: MarkObject): IMarkObjectJSON {
    return {
      id: obj.id,
      index: obj.index,
      label: obj.label,
      color: obj.color,
      type: obj.type,
      pointList: (obj.resultPoints || obj.pointList).map((point) => ({
        ...point,
      })),
      data: obj.data,
      layerId: obj.layerId,
      rotation: obj.rotation,
    };
  }
  /** 导入单个标注对象（校验图层归属与ID唯一） */
  importObject(data: IMarkObjectJSON): MarkObject | null {
    if (!data.type || !this.markMap[data.type]) return null;
    let obj;
    try {
      obj = this.markMap[data.type].import(this, data);
    } catch (err) {
      throw new Error(`${data.type} mark type is not supported`);
    }
    if (!obj) return null;
    // 未指定或图层不存在时归入默认图层
    obj.layerId = this.getLayer(data.layerId || "")
      ? (data.layerId as string)
      : this.layerList[0].id;
    // 保留原ID（冲突时生成新ID）
    if (data.id && !this.markObjectList.some((item) => item.id === data.id)) {
      obj.id = data.id;
    }
    return obj;
  }
  /** 设置标注对象 */
  public setObjectData(list: IMarkObjectJSON[]) {
    this.pushHistory();
    /** 添加的时候把最后一个绘制中的去掉 */
    if (this.currentDrawingType) {
      let obj = this.markObjectList[this.markObjectList.length - 1];
      if (obj && obj.status === "draw") {
        obj?.destory();
        this.markObjectList.pop();
      }
    }
    list.forEach((item) => {
      let obj = this.importObject(item);
      obj && this.markObjectList.push(obj);
    });
    this.render();
    this.addObjectData();
  }
  /** 导出画布数据（图层 + 标注） */
  exportData(): IMarkBoardData {
    return {
      layers: this.layers,
      objects: this.markObjectList
        .filter((obj) => obj.status !== "draw")
        .map((obj) => this.exportObject(obj)),
    };
  }
  /** 导入画布数据（支持旧版纯对象数组） */
  importData(data: IMarkBoardData | IMarkObjectJSON[]) {
    this.pushHistory();
    // 清空现有对象
    this.markObjectList.forEach((obj) => obj.destory());
    this.markObjectList = [];
    this.selectObject = undefined;
    this.selectObjects = [];
    let list: IMarkObjectJSON[];
    if (Array.isArray(data)) {
      list = data;
    } else {
      if (data.layers && data.layers.length) {
        this.layerList = data.layers.map((layer) => ({
          visible: true,
          locked: false,
          opacity: 1,
          ...layer,
        }));
      }
      list = data.objects || [];
    }
    if (!this.layerList.length) {
      this.layerList = [createDefaultLayer()];
    }
    this.activeLayerId = this.layerList[0].id;
    list.forEach((item) => {
      let obj = this.importObject(item);
      obj && this.markObjectList.push(obj);
    });
    this.clearCanvas(this.regionCtx);
    this.render();
    this.addObjectData();
    this.emit("onlayerchange");
  }
  /** 设置单个对象标签 */
  setObject(id: IMarkObjectId, data: IObjectLabelData) {
    let obj = this.markObjectList.find((item) => item.id === id);
    if (!obj || !this.isObjectInteractable(obj)) return;
    this.pushHistory();
    obj.setData(data);
  }
  /** 批量设置对象标签（单次历史记录） */
  setObjectsData(ids: IMarkObjectId[], data: IObjectLabelData) {
    let objs = this.markObjectList.filter(
      (item) => ids.includes(item.id) && this.isObjectInteractable(item)
    );
    if (!objs.length) return;
    this.pushHistory();
    objs.forEach((obj) => obj.setData(data));
  }
  /** 选中对象ID */
  public selectObjectById(id: IMarkObjectId) {
    let obj = this.markObjectList.find((item) => item.id === id);
    if (obj && this.isObjectInteractable(obj)) obj.setSelect();
  }
  /** 删除对象 */
  public deleteObject(id: IMarkObjectId) {
    this.deleteObjects([id]);
  }
  /** 批量删除对象（单次历史记录） */
  public deleteObjects(ids: IMarkObjectId[]) {
    let objs = this.markObjectList.filter(
      (item) => ids.includes(item.id) && item.status !== "draw"
    );
    if (!objs.length) return;
    this.pushHistory();
    objs.forEach((obj) => {
      obj.destory();
      this.markObjectList.splice(this.markObjectList.indexOf(obj), 1);
    });
    this.selectObjects = this.selectObjects.filter((obj) =>
      this.markObjectList.includes(obj)
    );
    if (this.selectObject && !this.markObjectList.includes(this.selectObject)) {
      this.selectObject = undefined;
    }
    this.clearCanvas(this.regionCtx);
    this.render();
    this.emit("onchange");
  }
  /** 删除当前选中的对象 */
  deleteSelection() {
    let list = this.selectObjects.length
      ? this.selectObjects
      : this.selectObject
      ? [this.selectObject]
      : [];
    let ids = list
      .filter((obj) => obj.status !== "draw")
      .map((obj) => obj.id);
    if (ids.length) this.deleteObjects(ids);
  }
  /** 设置移动状态 */
  public setMoveEditStatus(status: boolean) {
    if (this.moveStatus == status) return;
    this.moveStatus = status;
  }
  /** 键盘按下 */
  async windowKeydown(e: KeyboardEvent) {
    let target = e.target as HTMLElement | null;
    let inInput =
      !!target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);
    let meta = e.ctrlKey || e.metaKey;
    if (inInput) return;
    // 撤销/重做
    if (meta && e.code === "KeyZ") {
      e.preventDefault();
      if (e.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
      return;
    }
    if (meta && e.code === "KeyY") {
      e.preventDefault();
      this.redo();
      return;
    }
    // 复制/粘贴
    if (meta && e.code === "KeyC") {
      this.copySelection();
      return;
    }
    if (meta && e.code === "KeyV") {
      this.paste();
      return;
    }
    // 取消
    if (e.code === "Escape") {
      this.cancel();
      return;
    }
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
    if (e.code == "Delete") {
      // 删除选中的标注对象（支持多选）
      this.deleteSelection();
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
