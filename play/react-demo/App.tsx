import MarkBoard from "canvas-mark-board";
import React, { useEffect, useRef, useState, useCallback } from "react";
import jsonData from "../../assets/data.json";
import {
  MarkSidesArrowObject,
  MarkPolylineArrowObject,
  MarkTriangleObject,
  MarkDotObject,
  MarkRotateRectObject,
} from "custom-mark";
import img from "../../assets/image.jpg";
import shapeTypeList from "../../assets/shapeMap.json";
import LayerPanel from "./LayerPanel";
import HistoryBar from "./HistoryBar";

const COLOR_PRESETS = [
  "#ff0000",
  "#ff7a00",
  "#ffd000",
  "#22c55e",
  "#1677ff",
  "#7c3aed",
  "#ec4899",
];

function App() {
  const mark = useRef<MarkBoard | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [, setTick] = useState(0);

  const forceUpdate = useCallback(() => setTick((v) => v + 1), []);

  useEffect(() => {
    const board = createMark();
    function onResize() {
      board.handleResize();
    }
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      board?.destroy();
    };
  }, []);

  function createMark() {
    if (mark.current) return mark.current;
    mark.current = new MarkBoard({
      view: "#mark-box",
      lineWidth: 2,
      showLabel: true,
    });
    const board = mark.current;
    board.register("sides_arrow", MarkSidesArrowObject);
    board.register("polyline_arrow", MarkPolylineArrowObject);
    board.register("triangle", MarkTriangleObject);
    board.register("dot", MarkDotObject);
    board.register("rotateRect", MarkRotateRectObject);

    board.on("ondraw", (e) => {
      board.currentDrawingType = e.type;
      forceUpdate();
    });
    board.on("oncomplete", (e) => {
      e.ok({
        label: labelRef.current?.value || "object",
        color: colorRef.current?.value || "#ff0000",
      });
    });
    const refresh = () => forceUpdate();
    board.on("onchange", refresh);
    board.on("onlayerchange", refresh);
    board.on("onselect", refresh);
    board.on("onhistory", refresh);
    board.on("oncopy", refresh);
    board.setBackground(img).then(() => {
      board.setDrawType("rect");
    });
    return board;
  }

  function setMode(type: string) {
    mark.current?.setDrawType(type as any);
  }

  function uploadImage(file: File) {
    let reader = new FileReader();
    reader.onload = function (e) {
      mark.current
        ?.setBackground((e.target as any).result)
        .then(() => {
          mark.current!.setDrawType(
            mark.current!.currentDrawingType || "rect"
          );
        });
    };
    reader.readAsDataURL(file);
  }

  function exportJsonFile() {
    const data = mark.current?.exportData();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marks-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJsonFile(file: File) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const parsed = JSON.parse(String(e.target?.result));
        if (Array.isArray(parsed)) {
          mark.current?.importData(parsed);
        } else if (parsed && Array.isArray(parsed.objects)) {
          mark.current?.importData(parsed);
        } else {
          alert("JSON 格式不合法");
        }
      } catch (err) {
        alert("JSON 解析失败");
      }
    };
    reader.readAsText(file);
  }

  const board = mark.current;
  const objects = board?.objects || [];
  const layers = board?.layers || [];
  const activeLayerId = board?.activeLayerId;
  const selectedIds = board?.selectedIds || [];
  const historyList = board?.history.list || [];
  const historyIndex = board?.history.index ?? -1;
  const canUndo = board?.history.canUndo ?? false;
  const canRedo = board?.history.canRedo ?? false;

  const selectedCount = selectedIds.length;
  const selectedLayerIdSet = new Set(
    objects
      .filter((item: any) => selectedIds.includes(item.id))
      .map((item: any) => item.layerId)
  );

  return (
    <div style={{ width: "92vw", maxWidth: 1600, margin: "0 auto" }}>
      <h3 style={{ margin: "8px 0" }}>React canvas-mark-board Demo</h3>

      {/* 工具栏 */}
      <div className="toolbar">
        {shapeTypeList?.map((item: any, index: number) => {
          const active = board?.currentDrawingType === item.type;
          return (
            <button
              key={index}
              className={`tool-btn${active ? " active" : ""}`}
              title={item.type}
              onClick={() => setMode(item.type)}
            >
              <svg viewBox={item.viewBox} width="26" height="26">
                <path d={item.icon} fill={active ? "#FFF" : "#333"} />
              </svg>
            </button>
          );
        })}
        <button
          className={`tool-btn${
            board && !board.currentDrawingType ? " active" : ""
          }`}
          title="选择（框选 / Shift 点选）"
          onClick={() => setMode("")}
        >
          <svg viewBox="0 0 24 24" width="22">
            <path
              fill={board && !board.currentDrawingType ? "#fff" : "#333"}
              d="M4 2l14 7-6 1.5L8.5 17z"
            />
          </svg>
        </button>
        <span className="divider" />
        <button
          onClick={() => {
            if (board) {
              board.undo();
              forceUpdate();
            }
          }}
          disabled={!canUndo}
          title="撤销 Ctrl/Cmd+Z"
        >
          撤销
        </button>
        <button
          onClick={() => {
            board?.redo();
            forceUpdate();
          }}
          disabled={!canRedo}
          title="重做 Ctrl/Cmd+Shift+Z"
        >
          重做
        </button>
        <span className="divider" />
        <button onClick={() => fileRef.current?.click()}>上传图片</button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadImage(file);
            e.target.value = "";
          }}
        />
        <button onClick={exportJsonFile}>导出JSON</button>
        <button onClick={() => importFileRef.current?.click()}>导入JSON</button>
        <input
          ref={importFileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importJsonFile(file);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => {
            if (confirm("确认导入内置示例数据？当前标注会被覆盖。")) {
              mark.current?.importData(jsonData as any);
            }
          }}
        >
          示例数据
        </button>
        <button onClick={() => mark.current?.clearMarkShapes()}>清空标注</button>
        <button
          onClick={() => {
            mark.current?.destroy();
            mark.current = null;
            forceUpdate();
          }}
        >
          销毁
        </button>
        <button onClick={() => createMark()}>创建</button>
        <span className="divider" />
        <label>
          标签：
          <input
            ref={labelRef}
            type="text"
            defaultValue="person"
            style={{ width: 90 }}
          />
        </label>
        <label>
          颜色：
          <input ref={colorRef} type="color" defaultValue="#ff0000" />
        </label>
      </div>

      {/* 多选批量操作条 */}
      {selectedCount > 0 && (
        <div className="batch-bar">
          <span>已选 {selectedCount} 项</span>
          <span className="divider" />
          <label>
            批量颜色：
            <input
              type="color"
              key={selectedIds.join(",")}
              defaultValue={
                (objects.find((o: any) => o.id === selectedIds[0]) as any)
                  ?.color || "#ff0000"
              }
              onChange={(e) =>
                mark.current?.setObjectsData({ color: e.target.value })
              }
            />
          </label>
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              className="color-dot"
              style={{ background: c }}
              title={c}
              onClick={() => mark.current?.setObjectsData({ color: c })}
            />
          ))}
          <label>
            批量标签：
            <input
              type="text"
              style={{ width: 100 }}
              placeholder="新标签名"
              onBlur={(e) => {
                if (e.target.value) {
                  mark.current?.setObjectsData({ label: e.target.value });
                  e.target.value = "";
                }
              }}
            />
          </label>
          <label>
            移动到图层：
            <select
              value={
                selectedLayerIdSet.size === 1
                  ? Array.from(selectedLayerIdSet)[0]
                  : ""
              }
              onChange={(e) => mark.current?.setObjectLayer(e.target.value)}
            >
              {selectedLayerIdSet.size !== 1 && <option value="">请选择</option>}
              {layers.map((layer: any) => (
                <option key={layer.id} value={layer.id}>
                  {layer.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="danger"
            onClick={() => mark.current?.deleteObjects()}
            title="Delete"
          >
            删除（Delete）
          </button>
          <button onClick={() => mark.current?.copy()} title="Ctrl/Cmd+C">
            复制
          </button>
          <button onClick={() => mark.current?.paste()} title="Ctrl/Cmd+V">
            粘贴
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, height: "calc(78vh - 90px)" }}>
        {/* 画布 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div id="mark-box" className="mark-box"></div>
          <div className="tips">
            双击复位 · Ctrl/Cmd/Alt+滚轮缩放 · 空格拖动 ·
            选择工具下框选多选 · Shift+点选增删 · Ctrl/Cmd+A 全选 ·
            Ctrl/Cmd+C/V 复制粘贴 · Delete 删除 · Esc 取消 ·
            Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z 撤销重做
          </div>
        </div>

        {/* 右侧：图层面板 + 对象列表 */}
        <div className="side">
          <LayerPanel
            layers={layers}
            objects={objects}
            activeLayerId={activeLayerId}
            selectedIds={selectedIds}
            board={mark.current}
            onRefresh={forceUpdate}
          />
          <div className="panel-title">
            标注对象（{objects.length}）
          </div>
          <div className="object-list">
            {objects.map((item: any) => {
              const selected = selectedIds.includes(item.id);
              const layer = layers.find((l: any) => l.id === item.layerId);
              return (
                <div
                  key={item.id}
                  className={`object-row${selected ? " selected" : ""}`}
                  onClick={(e) => {
                    if (e.shiftKey) {
                      const ids = selected
                        ? selectedIds.filter((id) => id !== item.id)
                        : selectedIds.concat(item.id);
                      mark.current?.setSelected(ids);
                    } else {
                      mark.current?.setSelected([item.id]);
                    }
                  }}
                >
                  <span
                    className="color-tag"
                    style={{ background: item.color }}
                  />
                  <input
                    className="label-input"
                    title="label 标签名"
                    defaultValue={item.label}
                    key={`${item.id}-${item.label}`}
                    onChange={(e) => {
                      mark.current?.setObject(item.id, {
                        label: e.target.value,
                      });
                    }}
                  />
                  <span className="type-tag">{item.type}</span>
                  <select
                    title="所属图层"
                    value={layer ? item.layerId : "default"}
                    onChange={(e) =>
                      mark.current?.setObjectLayer(e.target.value, [item.id])
                    }
                  >
                    {!layer && <option value="default">默认图层</option>}
                    {layers.map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <input
                    title="color 颜色"
                    type="color"
                    defaultValue={item.color}
                    key={`${item.id}-${item.color}`}
                    onChange={(e) =>
                      mark.current?.setObject(item.id, {
                        color: e.target.value,
                      })
                    }
                  />
                  <button
                    title="删除"
                    onClick={(e) => {
                      e.stopPropagation();
                      mark.current?.deleteObject(item.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {!objects.length && (
              <div className="empty">暂无标注，选择图形开始绘制</div>
            )}
          </div>
        </div>
      </div>

      {/* 历史操作栏 + 导出内容 */}
      <HistoryBar
        list={historyList}
        index={historyIndex}
        canUndo={canUndo}
        canRedo={canRedo}
        board={mark.current}
        onRefresh={forceUpdate}
      />
    </div>
  );
}

export default App;
