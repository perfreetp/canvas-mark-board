import { getUUID } from "../utils";
import type { ILayerJSON } from "../types";

let layerSeed = 0;

/** 生成图层 ID */
export function getLayerUUID(): string {
  layerSeed += 1;
  return `layer_${Date.now().toString(36)}_${layerSeed}_${getUUID().slice(
    0,
    8
  )}`;
}

/**
 * 标注图层
 */
export default class MarkLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** 不透明度 0 - 1 */
  opacity: number;

  constructor(data?: Partial<ILayerJSON> & { id?: string }) {
    this.id = data?.id || getLayerUUID();
    this.name = data?.name || "图层";
    this.visible = data?.visible ?? true;
    this.locked = data?.locked ?? false;
    this.opacity = data?.opacity ?? 1;
  }

  setData(data: Partial<Omit<ILayerJSON, "id">>) {
    if (data.name !== undefined) this.name = data.name;
    if (data.visible !== undefined) this.visible = data.visible;
    if (data.locked !== undefined) this.locked = data.locked;
    if (data.opacity !== undefined) {
      this.opacity = Math.max(0, Math.min(1, data.opacity));
    }
  }

  toJSON(): ILayerJSON {
    return {
      id: this.id,
      name: this.name,
      visible: this.visible,
      locked: this.locked,
      opacity: this.opacity,
    };
  }
}
