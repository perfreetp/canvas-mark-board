import MarkBoard from "canvas-mark-board";
import React, { useEffect, useRef, useState } from "react";
import jsonData from "../../assets/data.json";
import {
  MarkSidesArrowObject,
  MarkPolylineArrowObject,
  MarkTriangleObject,
  MarkRotateRectObject,
  MarkDotObject,
} from "custom-mark";
import img from "../../assets/image.jpg";
import shapeTypeList from "../../assets/shapeMap.json";

function App() {
  const mark = useRef<MarkBoard>(null);
  const labelRef = useRef(null);
  const colorRef = useRef(null);
  const batchColorRef = useRef(null);
  const dragLayerId = useRef<string>("");
  const [objectList, setObjectList] = useState<any>([]);
  const [layerList, setLayerList] = useState<any>([]);
  const [activeLayerId, setActiveLayerId] = useState<string>("");
  const [drawType, setDrawType] = useState<string>("");
  const [selectedCount, setSelectedCount] = useState<number>(0);
  const [historyInfo, setHistoryInfo] = useState({ undo: 0, redo: 0 });
  const [exportText, setExportText] = useState<string>("");

  useEffect(() => {
    const mark = createMark();
    function onResize() {
      mark.handleResize();
    }
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      mark?.destroy();
    };
  }, []);

  function syncState() {
    if (!mark.current) return;
    setObjectList([...mark.current.objects]);
    setSelectedCount(mark.current.selectObjects.length);
    setExportText(JSON.stringify(mark.current.exportData(), null, 2));
  }

  function createMark() {
    mark.current = new MarkBoard({
      view: "#mark-box", // ID名或者DOM对象
      lineWidth: 2,
      showLabel: true,
    });
    mark.current.register("sides_arrow", MarkSidesArrowObject);
    mark.current.register("polyline_arrow", MarkPolylineArrowObject);
    mark.current.register("triangle", MarkTriangleObject);
    mark.current.register("dot", MarkDotObject);
    mark.current.register("rotateRect", MarkRotateRectObject);

    mark.current.on("ondraw", (e) => {
      mark.current!.currentDrawingType = e.type;
      setDrawType(e.type);
    });
    mark.current.on("oncomplete", (e) => {
      e.ok({ label: labelRef.current!.value, color: colorRef.current!.value });
    });
    mark.current.on("onchange", syncState);
    mark.current.on("onlayerchange", () => {
      setLayerList(mark.current!.layers);
      setActiveLayerId(mark.current!.activeLayerId);
      syncState();
    });
    mark.current.on("onhistorychange", () => {
      setHistoryInfo({
        undo: mark.current!.historyUndo.length,
        redo: mark.current!.historyRedo.length,
      });
    });
    setLayerList(mark.current.layers);
    setActiveLayerId(mark.current.activeLayerId);
    mark.current.setBackground(img).then(() => {
      mark.current?.setDrawType("rect");
    });
    return mark.current;
  }
  function setMode(type: any) {
    mark.current?.setDrawType(type);
  }
  function uploadImage() {
    let input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = function (e) {
      let file = (e.target as any).files[0];
      if (file) {
        let reader = new FileReader();
        reader.onload = function (e) {
          mark.current?.setBackground((e.target as any).result).then(() => {
            mark.current.setDrawType(mark.current.currentDrawingType || "rect");
          });
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  }
  /** 导入内置示例数据（旧版纯数组格式，归入默认图层） */
  function importJson() {
    mark.current?.importData(jsonData as any);
  }
  /** 导入JSON文件（支持 { layers, objects } 与纯对象数组） */
  function importFile() {
    let input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = function (e) {
      let file = (e.target as any).files[0];
      if (file) {
        let reader = new FileReader();
        reader.onload = function (e) {
          try {
            let data = JSON.parse((e.target as any).result);
            mark.current?.importData(data);
          } catch (err) {
            alert("JSON 解析失败");
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }
  /** 导出图层 + 标注数据 */
  function exportJson() {
    if (!mark.current) return;
    let data = mark.current.exportData();
    let blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    let a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mark-data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  /** 批量修改选中对象颜色 */
  function applyBatchColor() {
    if (!mark.current) return;
    let ids = mark.current.selectObjects.map((obj) => obj.id);
    if (!ids.length) {
      alert("请先在画布上选中对象（支持 Shift 点选 / 选择模式下框选）");
      return;
    }
    mark.current.setObjectsData(ids, {
      color: batchColorRef.current!.value,
    });
  }
  /** 图层拖拽排序（显示列表自上而下，layerList 自下而上） */
  function onLayerDrop(displayIndex: number) {
    if (!mark.current || !dragLayerId.current) return;
    let toIndex = layerList.length - 1 - displayIndex;
    mark.current.moveLayer(dragLayerId.current, toIndex);
    dragLayerId.current = "";
  }

  // 显示时最上面的图层在最前
  const displayLayers = [...layerList].reverse();

  return (
    <div style={{ width: "80vw", maxWidth: 1440, margin: "0 auto" }}>
      <h3 style={{ margin: 0 }}>React canvas-mark-board Demo:</h3>
      <div>
        <button
          title="选择模式（可框选）"
          style={{
            background: drawType === "" ? "#000" : "transparent",
            color: drawType === "" ? "#fff" : "#333",
          }}
          onClick={() => setMode("")}
        >
          选择
        </button>
        {shapeTypeList?.map((item, index) => {
          return (
            <button
              key={index}
              style={{
                background: drawType === item.type ? "#000" : "transparent",
              }}
              onClick={() => {
                setMode(item.type);
              }}
            >
              <svg
                viewBox={item.viewBox}
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
              >
                <path
                  d={item.icon}
                  fill={drawType === item.type ? "#FFF" : "#333333"}
                ></path>
              </svg>
            </button>
          );
        })}
        <button onClick={uploadImage}>上传图片</button>
        <button
          onClick={() => {
            mark.current?.clearMarkShapes();
          }}
        >
          清空画布
        </button>
        <button onClick={importJson}>导入示例JSON</button>
        <button onClick={importFile}>导入文件</button>
        <button onClick={exportJson}>导出JSON</button>
        <button onClick={createMark}>创建</button>
        <button
          onClick={() => {
            mark.current?.destroy();
            mark.current = undefined;
          }}
        >
          销毁
        </button>
        标签名：
        <input ref={labelRef} type="text" defaultValue="person" />
        颜色：
        <input ref={colorRef} type="color" defaultValue="#ff0000" />
        <a className="remark">
          操作说明?
          <div>
            <b>画布操作</b>：1.双击鼠标恢复大小; 2.ctrl或cmd或alt+滚轮缩放;
            3.按住空格拖动画布
            <br />
            <b>多边形绘制</b>：1.右键删除最后一个点;
            2.点击第一个点或者按回车完成绘制
            <br />
            <b>多选</b>：1.选择模式下拖拽框选; 2.按住Shift点选;
            3.选中多个后可批量移动/删除/改色
            <br />
            <b>快捷键</b>：Ctrl/Cmd+C 复制; Ctrl/Cmd+V 粘贴;
            Ctrl/Cmd+Z 撤销; Ctrl/Cmd+Shift+Z 重做; Delete 删除; Esc 取消
          </div>
        </a>
      </div>
      <div style={{ margin: "4px 0" }}>
        <b>历史操作：</b>
        <button
          disabled={!historyInfo.undo}
          onClick={() => mark.current?.undo()}
        >
          ↶ 撤销({historyInfo.undo})
        </button>
        <button
          disabled={!historyInfo.redo}
          onClick={() => mark.current?.redo()}
        >
          ↷ 重做({historyInfo.redo})
        </button>
        <b style={{ marginLeft: 16 }}>批量操作（已选 {selectedCount} 个）：</b>
        <input ref={batchColorRef} type="color" defaultValue="#00a2ff" />
        <button onClick={applyBatchColor}>批量改色</button>
        <button onClick={() => mark.current?.deleteSelection()}>
          批量删除
        </button>
        <button onClick={() => mark.current?.copySelection()}>复制</button>
        <button onClick={() => mark.current?.paste()}>粘贴</button>
      </div>
      <div style={{ display: "flex", height: "calc(80vh - 140px)" }}>
        <div style={{ flex: 1 }}>
          <div
            id="mark-box"
            style={{
              height: "100%",
              width: `100%`,
              border: "1px solid #ccc",
            }}
          ></div>
        </div>
        <div
          style={{
            width: "260px",
            height: "100%",
            overflow: "auto",
            marginLeft: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <b>图层</b>
            <button
              style={{ marginLeft: "auto" }}
              onClick={() => mark.current?.addLayer()}
            >
              + 新增图层
            </button>
          </div>
          {displayLayers.map((layer: any, displayIndex: number) => {
            return (
              <div
                key={`${layer.id}-${layer.name}`}
                draggable
                onDragStart={() => {
                  dragLayerId.current = layer.id;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onLayerDrop(displayIndex)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 4px",
                  marginBottom: 2,
                  cursor: "grab",
                  border:
                    activeLayerId === layer.id
                      ? "1px solid #1677ff"
                      : "1px solid #eee",
                  background: activeLayerId === layer.id ? "#e6f4ff" : "#fff",
                }}
                onClick={() => mark.current?.setActiveLayer(layer.id)}
              >
                <span title="拖拽排序">☰</span>
                <input
                  type="checkbox"
                  title="显示/隐藏"
                  checked={layer.visible}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    mark.current?.updateLayer(layer.id, {
                      visible: e.target.checked,
                    });
                  }}
                />
                <input
                  type="checkbox"
                  title="锁定"
                  checked={layer.locked}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    mark.current?.updateLayer(layer.id, {
                      locked: e.target.checked,
                    });
                  }}
                />
                <input
                  style={{ width: 60 }}
                  title="图层名"
                  defaultValue={layer.name}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    mark.current?.updateLayer(layer.id, {
                      name: e.target.value,
                    });
                  }}
                />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  title={`透明度 ${layer.opacity}`}
                  defaultValue={layer.opacity}
                  style={{ width: 40 }}
                  onClick={(e) => e.stopPropagation()}
                  onPointerUp={(e) => {
                    mark.current?.updateLayer(layer.id, {
                      opacity: Number((e.target as HTMLInputElement).value),
                    });
                  }}
                />
                <button
                  title="删除图层"
                  disabled={layerList.length <= 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    mark.current?.removeLayer(layer.id);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
          <b>标注对象</b>
          {objectList.map((item: any, index: number) => {
            return (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background:
                    mark.current?.selectObject?.id == item.id
                      ? "#ccc"
                      : "#fff",
                }}
                key={index}
                onClick={() => {
                  mark.current?.selectObjectById(item.id);
                }}
              >
                <input
                  style={{
                    width: 70,
                  }}
                  title="label 标签名"
                  defaultValue={item.label}
                  onBlur={(e) => {
                    mark.current?.setObject(item.id, {
                      label: e.target.value,
                    });
                  }}
                />
                <input
                  title="color 颜色"
                  onChange={(e) => {
                    mark.current?.setObject(item.id, {
                      color: e.target.value,
                    });
                  }}
                  type="color"
                  defaultValue={item.color}
                />
                <span
                  style={{ fontSize: 12, color: "#999" }}
                  title="所属图层"
                >
                  {layerList.find((l: any) => l.id === item.layerId)?.name ||
                    "默认图层"}
                </span>
                <button
                  style={{ marginLeft: "auto" }}
                  onClick={() => {
                    mark.current?.deleteObject(item.id);
                  }}
                >
                  删除
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <textarea
        style={{ width: "100%" }}
        readOnly
        value={exportText}
        cols={30}
        rows={10}
      ></textarea>
    </div>
  );
}
export default App;
