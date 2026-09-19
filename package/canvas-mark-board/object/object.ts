import CanvasMarkBoard from "../board";
import { DEFAULT_LAYER_ID } from "../types";
import type {
  IPointData,
  IMarkObjectJSON,
  IMarkBoardDrawType,
  IObjectLabelData,
} from "../types";
interface MarkObject {
  /** 销毁 */
  destory(): void;
  /** 完成绘制 */
  complete(): void;
  /** 渲染 */
  render(): void;
  /** 导出函数 */
  export(): IMarkObjectJSON;
  /** 判断点是否在内部 */
  isPointInside(point: IPointData): boolean;
  boxMousedown(point: IPointData): void;
  boxMousemove(point: IPointData): void;
  boxMouseup(point: IPointData): void;
  /** path数据 */
  pathData: string;
  indexPoint: IPointData;
  resultPoints?: IPointData[];
  /** 顶点列表（用于点选/调整点） */
  vertexList: IPointData[];
}

/**
 * 标注对象
 */
class MarkObject implements MarkObject {
  /** 标注ID  初始化随机生成 用来比对区分的 */
  id: string = "";
  // 子图形对象数组
  group: any[] = [];
  // 点位列表
  pointList: IPointData[] = [];
  // 上次点位列表
  oldPointList: IPointData[] = [];
  // 最小点位数量
  minPointCount!: number;
  // 对象类型
  type!: IMarkBoardDrawType;
  // 标签
  data: any = {};
  label: string = "";
  color: string = "#ff0000";
  // 序号
  index: number = 1;
  // 所属图层 ID
  layerId: string = DEFAULT_LAYER_ID;
  // 父级容器
  box!: CanvasMarkBoard;
  // 容器事件ID
  boxEventIds: any[] = [];
  // 状态 draw=绘制中  edit=编辑中 done=已完成
  status: "draw" | "edit" | "done" = "draw";
  // 完成中
  completeing: boolean = false;
  // 选中偏差
  expent: number = 5;
  // 鼠标按下
  mouseDown: boolean = false;
  // 鼠标最后按下坐标
  lastMousePoint?: IPointData = { x: 0, y: 0 };
  /** 激活点位 */
  acctivePointIndex: number = -1;
  /**旋转信息 */
  rotation?: number = undefined;

  /** 所属图层是否可见 */
  get layerVisible(): boolean {
    return this.box?.isLayerVisible(this.layerId) ?? true;
  }

  /** 所属图层是否可编辑（未锁定且可见） */
  get layerEditable(): boolean {
    return this.box?.isLayerEditable(this.layerId) ?? true;
  }

  /** 是否处于多选集合中 */
  get isSelected(): boolean {
    return !!this.box?.isSelected(this.id);
  }

  /**
   * 设置选中状态
   * @param select
   */
  setSelect() {
    // 多选集合统一由 board 管理
    this.box.setSelected([this.id]);
  }

  setData(data: IObjectLabelData) {
    const { label, color } = data;
    this.box.runHistory("修改标签", () => {
      if (label !== undefined) {
        this.label = label;
      }
      if (color !== undefined) {
        this.color = color;
      }
    });
    this.render();
    this.box.render();
    this.box.emit("onchange");
  }

  /** 导出可序列化数据（基类通用实现，自定义图形可覆盖） */
  export(): IMarkObjectJSON {
    return {
      id: this.id,
      index: this.index,
      label: this.label,
      color: this.color,
      type: this.type,
      pointList: JSON.parse(JSON.stringify(this.resultPoints || this.pointList)),
      layerId: this.layerId,
      ...(this.rotation !== undefined ? { rotation: this.rotation } : {}),
      ...(this.data !== undefined && this.data !== null
        ? { data: this.data }
        : {}),
    };
  }
}

export default MarkObject;
