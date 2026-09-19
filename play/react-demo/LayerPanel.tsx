import React, { useState, useRef } from "react";
import type MarkBoard from "canvas-mark-board";

interface LayerPanelProps {
  layers: any[];
  objects: any[];
  activeLayerId?: string;
  selectedIds: string[];
  board: MarkBoard | null;
  onRefresh: () => void;
}

/**
 * 图层面板：新增 / 删除 / 重命名 / 显隐 / 锁定 / 透明度 / 拖拽排序
 * 列表顶部为最上层（数组末尾），与画布 z 序一致。
 * 拖拽基于指针事件实现（不依赖原生 HTML5 DnD，兼容性更好）。
 */
export default function LayerPanel(props: LayerPanelProps) {
  const { layers, objects, activeLayerId, selectedIds, board, onRefresh } =
    props;
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragging = useRef(false);
  const handleEl = useRef<HTMLElement | null>(null);

  // 自上而下展示：最后创建的图层在最上面
  const ordered = layers.slice().reverse();

  function countOf(layerId: string) {
    return objects.filter((item) => item.layerId === layerId).length;
  }

  function rowFromPoint(clientX: number, clientY: number): string | null {
    // 暂时隐藏拖拽手柄，避免它挡住命中检测
    const handle = handleEl.current;
    const prevPointer = handle?.style.pointerEvents;
    if (handle) handle.style.pointerEvents = "none";
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (handle) handle.style.pointerEvents = prevPointer || "";
    const row = el?.closest?.(".layer-row") as HTMLElement | null;
    return row?.dataset.layerId || null;
  }

  function onPointerDown(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return;
    dragging.current = true;
    handleEl.current = e.currentTarget as HTMLElement;
    setDragId(id);
    setOverId(id);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const target = rowFromPoint(e.clientX, e.clientY);
    if (target && target !== dragId) setOverId(target);
  }
  function onPointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragId && overId && dragId !== overId) {
      // 面板自上而下 = 数组自后向前；先模拟移除被拖拽项，再取目标下标
      const remainingVisual = ordered.filter((l) => l.id !== dragId);
      const visualIndex = remainingVisual.findIndex(
        (l) => l.id === overId
      );
      const targetArrayIndex = remainingVisual.length - 1 - visualIndex;
      board?.setLayerIndex(dragId, targetArrayIndex);
      onRefresh();
    }
    setDragId(null);
    setOverId(null);
  }

  return (
    <div>
      <div className="panel-title panel-head">
        <span>图层（{layers.length}）</span>
        <button
          className="mini"
          title="新增图层"
          onClick={() => {
            board?.addLayer({ name: `图层 ${layers.length + 1}` });
            onRefresh();
          }}
        >
          ＋
        </button>
      </div>
      <div className="layer-list">
        {ordered.map((layer) => {
          const isDefault = layer.id === "default";
          const isActive = layer.id === activeLayerId;
          const selectedInLayer = objects.some(
            (item) =>
              selectedIds.includes(item.id) && item.layerId === layer.id
          );
          return (
            <div
              key={layer.id}
              data-layer-id={layer.id}
              className={`layer-row${isActive ? " active" : ""}${
                overId === layer.id && dragId !== layer.id
                  ? " dragover"
                  : ""
              }${dragId === layer.id ? " dragging" : ""}${
                selectedInLayer ? " has-selection" : ""
              }`}
              onClick={() => {
                board?.setActiveLayer(layer.id);
                onRefresh();
              }}
              title="拖动 ⋮⋮ 可调整图层顺序"
            >
              <span
                className="drag-handle"
                title="拖拽排序"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onPointerDown(e, layer.id);
                }}
                onPointerMove={onPointerMove}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  onPointerUp();
                }}
              >
                ⋮⋮
              </span>
              <input
                type="checkbox"
                title={layer.visible ? "隐藏图层" : "显示图层"}
                checked={layer.visible}
                onChange={() => {
                  board?.updateLayer(layer.id, { visible: !layer.visible });
                  onRefresh();
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                className={`lock-btn${layer.locked ? " locked" : ""}`}
                title={layer.locked ? "解锁图层" : "锁定图层"}
                onClick={(e) => {
                  e.stopPropagation();
                  board?.updateLayer(layer.id, { locked: !layer.locked });
                  onRefresh();
                }}
              >
                {layer.locked ? "🔒" : "🔓"}
              </button>
              <input
                className="layer-name"
                value={layer.name}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  board?.updateLayer(layer.id, { name: e.target.value })
                }
              />
              <span className="layer-count">{countOf(layer.id)}</span>
              <label
                className="opacity-wrap"
                title={`透明度 ${Math.round(layer.opacity * 100)}%`}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={layer.opacity}
                  onChange={(e) =>
                    board?.updateLayer(layer.id, {
                      opacity: Number(e.target.value),
                    })
                  }
                />
              </label>
              <button
                className="mini danger-text"
                title={isDefault ? "默认图层不可删除" : "删除图层（含其内标注）"}
                disabled={isDefault}
                onClick={(e) => {
                  e.stopPropagation();
                  if (
                    confirm(
                      `删除图层「${layer.name}」？图层内标注将一并删除。`
                    )
                  ) {
                    board?.deleteLayer(layer.id);
                    onRefresh();
                  }
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
