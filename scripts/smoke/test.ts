import "./setup";
import MarkBoard from "../../package/canvas-mark-board/index";

let passed = 0;
let failed = 0;
function assert(cond: any, message: string) {
  if (cond) {
    passed += 1;
    // console.log("  ✓", message);
  } else {
    failed += 1;
    console.error("  ✗", message);
  }
}
function approx(a: number, b: number, eps = 0.001) {
  return Math.abs(a - b) < eps;
}

function makeEvent(x: number, y: number, opts: any = {}) {
  return {
    button: 0,
    buttons: 1,
    offsetX: x,
    offsetY: y,
    x,
    y,
    shiftKey: !!opts.shiftKey,
    ctrlKey: !!opts.ctrlKey,
    metaKey: !!opts.metaKey,
    preventDefault() {},
    target: null,
  } as unknown as MouseEvent;
}

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const board = new MarkBoard({ view: "#smoke-box", showLabel: true });
  // 默认标签完成回调：直接返回固定标签
  board.on("oncomplete", (e: any) => e.ok({ label: "obj", color: "#ff0000" }));

  /* ---------------- 基础：绘制一个矩形 ---------------- */
  await board.setDrawType("rect");
  assert(board.currentDrawingType === "rect", "绘制模式设置为 rect");
  board.appMousedown(makeEvent(100, 100));
  board.appMousemove(makeEvent(200, 200));
  board.appMouseup(makeEvent(200, 200));
  await wait(10);
  const r1 = board.objects;
  assert(r1.length === 1, "矩形绘制完成后有 1 个对象");
  const id1 = r1[0].id;
  assert(r1[0].layerId === "default", "新对象归入默认图层");

  /* ---------------- 图层：新增 + 归属 ---------------- */
  const layer2 = board.addLayer({ name: "第二层" });
  board.setActiveLayer(layer2);
  await board.setDrawType("rect");
  board.appMousedown(makeEvent(300, 300));
  board.appMousemove(makeEvent(400, 400));
  board.appMouseup(makeEvent(400, 400));
  await wait(10);
  const id2 = board.objects.find((o) => o.id !== id1)!.id;
  assert(
    board.objects.find((o) => o.id === id2)!.layerId === layer2,
    "新对象归入激活图层"
  );

  /* ---------------- 隐藏图层：不参与点选 ---------------- */
  board.updateLayer(layer2, { visible: false });
  const hitHidden = board.getObjectAtPoint({ x: 350, y: 350 });
  assert(
    !hitHidden || hitHidden.id !== id2,
    "隐藏图层对象无法被点选"
  );
  // 主层对象仍可选中
  const hitDefault = board.getObjectAtPoint({ x: 150, y: 150 });
  assert(hitDefault?.id === id1, "可见图层对象可点选");
  board.undo();
  assert(board.isLayerVisible(layer2), "撤销后图层恢复可见");

  /* ---------------- 锁定图层：不参与点选与编辑 ---------------- */
  board.updateLayer(layer2, { locked: true });
  const hitLocked = board.getObjectAtPoint({ x: 350, y: 350 });
  assert(!hitLocked || hitLocked.id !== id2, "锁定图层对象无法被点选");
  board.selectObjectById(id2);
  assert(!board.isSelected(id2), "锁定图层对象无法被选中");
  board.undo(); // 取消锁定（栈顶是锁定操作）
  assert(!board.getLayer(layer2)!.locked, "撤销后图层解除锁定");

  /* ---------------- 框选多选 ---------------- */
  board.setDrawType("" as any);
  // 从空白处按下拖出包含两个对象的框
  board.appMousedown(makeEvent(50, 50));
  board.appMousemove(makeEvent(450, 450));
  board.appMouseup(makeEvent(450, 450));
  assert(board.selectedIds.length === 2, "框选选中 2 个对象");

  /* ---------------- Shift 点选切换 ---------------- */
  board.appMousedown(makeEvent(50, 50));
  board.appMouseup(makeEvent(50, 50));
  assert(board.selectedIds.length === 0, "空白点击清空选中");
  board.appMousedown(makeEvent(150, 150));
  board.appMouseup(makeEvent(150, 150));
  assert(board.selectedIds.length === 1, "点选选中 1 个");
  board.appMousedown(makeEvent(350, 350, { shiftKey: true }));
  board.appMouseup(makeEvent(350, 350, { shiftKey: true }));
  assert(board.selectedIds.length === 2, "Shift 点选追加选中");
  board.appMousedown(makeEvent(350, 350, { shiftKey: true }));
  board.appMouseup(makeEvent(350, 350, { shiftKey: true }));
  assert(board.selectedIds.length === 1, "Shift 再点取消选中");

  /* ---------------- 批量移动 ---------------- */
  // 选中两个
  board.appMousedown(makeEvent(350, 350, { shiftKey: true }));
  board.appMouseup(makeEvent(350, 350, { shiftKey: true }));
  const before = board.objects.map((o) => ({
    id: o.id,
    x: o.pointList[0].x,
    y: o.pointList[0].y,
  }));
  // 拖动主选（id1 是主选）
  board.setSelected([id1, id2]);
  board.appMousedown(makeEvent(150, 150));
  board.appMousemove(makeEvent(160, 170));
  board.appMouseup(makeEvent(160, 170));
  const after = board.objects.map((o) => ({
    id: o.id,
    x: o.pointList[0].x,
    y: o.pointList[0].y,
  }));
  before.forEach((b) => {
    const a = after.find((x) => x.id === b.id)!;
    assert(approx(a.x - b.x, 10), `对象 ${b.id} 批量移动 dx=10`);
    assert(approx(a.y - b.y, 20), `对象 ${b.id} 批量移动 dy=20`);
  });

  /* ---------------- 批量删除 / Delete ---------------- */
  board.deleteObjects();
  assert(board.objects.length === 0, "批量删除后对象为空");
  board.undo();
  assert(board.objects.length === 2, "撤销批量删除恢复 2 个对象");

  /* ---------------- 批量改颜色 ---------------- */
  board.setSelected([id1, id2]);
  board.setObjectsData({ color: "#00ff00" });
  assert(
    board.objects.every((o) => o.color === "#00ff00"),
    "批量颜色修改生效"
  );
  board.undo();
  assert(
    board.objects.find((o) => o.id === id1)!.color === "#ff0000",
    "撤销批量改色恢复"
  );

  /* ---------------- 复制粘贴 ---------------- */
  board.setSelected([id1, id2]);
  const copied = board.copy();
  assert(copied.length === 2, "复制 2 个对象到剪贴板");
  const pasted = board.paste(15);
  assert(pasted.length === 2, "粘贴生成 2 个新对象");
  assert(board.objects.length === 4, "粘贴后共 4 个对象");
  assert(board.selectedIds.length === 2, "粘贴后选中新对象");
  const orig1 = board.objects.find((o) => o.id === id1)!;
  const new1 = board.objects.find(
    (o) => !new Set([id1, id2]).has(o.id) && o.layerId === orig1.layerId
  )!;
  assert(
    approx(new1.pointList[0].x - orig1.pointList[0].x, 15) &&
      approx(new1.pointList[0].y - orig1.pointList[0].y, 15),
    "粘贴对象位置偏移 15"
  );
  assert(
    new1.layerId === orig1.layerId,
    "粘贴对象保持图层归属"
  );
  board.undo();
  assert(board.objects.length === 2, "撤销粘贴恢复 2 个对象");

  /* ---------------- Esc 取消选中 ---------------- */
  board.setSelected([id1, id2]);
  (board as any).windowKeydown({
    code: "Escape",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    key: "Escape",
    preventDefault() {},
    target: null,
  } as unknown as KeyboardEvent);
  assert(board.selectedIds.length === 0, "Esc 取消选中");

  /* ---------------- 撤销/重做一致性 ---------------- */

  /* ---------------- 撤销/重做一致性（独立干净数据） ---------------- */
  const clean = {
    layers: [
      { id: "default", name: "默认图层", visible: true, locked: false, opacity: 1 },
      { id: "l2", name: "L2", visible: true, locked: false, opacity: 1 },
    ],
    objects: [
      {
        id: "a", label: "p", color: "#ff0000", type: "rect", layerId: "default",
        pointList: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
      },
      {
        id: "b", label: "p", color: "#00ff00", type: "circle", layerId: "l2",
        pointList: [{ x: 5, y: 5 }, { x: 7, y: 7 }],
      },
    ],
  };
  const cleanBoard = new MarkBoard({ view: "#smoke-clean" });
  cleanBoard.importData(clean as any);
  const stackLen = cleanBoard.history.list.length;
  assert(stackLen === 2, `导入后历史栈 2 条（实际 ${stackLen}）`);
  cleanBoard.undo();
  assert(cleanBoard.objects.length === 0, "撤销导入后无对象");
  assert(cleanBoard.layers.length === 1, "撤销导入后只剩默认图层");
  cleanBoard.redo();
  assert(cleanBoard.objects.length === 2, "重做导入后恢复 2 个对象");
  assert(cleanBoard.layers.length === 2, "重做导入后恢复 2 个图层");

  /* ---------------- 图层排序 + 导出/导入 ---------------- */
  cleanBoard.setLayerIndex("l2", 0);
  assert(cleanBoard.layerList[0].id === "l2", "图层排序：L2 移到底部");
  const exported = cleanBoard.exportData();
  assert(
    exported.layers[0].id === "l2" && exported.objects.length === 2,
    "导出数据包含图层顺序与对象"
  );
  assert(
    exported.objects.every((o) => o.layerId),
    "导出对象都带图层归属"
  );

  const board2 = new MarkBoard({ view: "#smoke-box2" });
  board2.importData(exported);
  assert(board2.layers.length === 2, "导入后图层数量正确");
  assert(board2.layers[0].id === "l2", "导入后图层顺序正确");
  assert(board2.objects.length === 2, "导入后对象数量正确");
  board2.objects.forEach((o) => {
    const orig = exported.objects.find((x) => x.id === o.id);
    assert(
      orig && o.layerId === orig.layerId,
      `导入后对象 ${o.id} 图层归属正确`
    );
  });

  /* ---------------- 旧数组格式导入兼容 ---------------- */
  const legacy = [
    {
      id: "legacy-1",
      label: "person",
      color: "#123456",
      type: "rect",
      pointList: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
    },
  ];
  board2.importData(legacy as any);
  assert(board2.objects.length === 1, "旧数组格式导入成功");
  assert(
    board2.objects[0].layerId === "default",
    "未指定图层对象归入默认图层"
  );

  /* ---------------- 删除图层连带对象 + 撤销 ---------------- */
  const beforeDelete = cleanBoard.objects.length;
  cleanBoard.deleteLayer("l2");
  assert(
    cleanBoard.objects.length === beforeDelete - 1,
    "删除图层后图层内对象被删除"
  );
  assert(cleanBoard.layers.every((l) => l.id !== "l2"), "图层被删除");
  cleanBoard.undo();
  assert(
    cleanBoard.layers.some((l) => l.id === "l2"),
    "撤销删除图层后图层恢复"
  );
  assert(
    cleanBoard.objects.length === beforeDelete,
    "撤销删除图层后对象恢复"
  );

  /* ---------------- 默认图层不可删 ---------------- */
  cleanBoard.deleteLayer("default");
  assert(
    cleanBoard.layers.some((l) => l.id === "default"),
    "默认图层不可删除"
  );

  /* ---------------- 透明度历史合并 ---------------- */
  const h1 = cleanBoard.history.list.length;
  cleanBoard.updateLayer("default", { opacity: 0.5 });
  cleanBoard.updateLayer("default", { opacity: 0.4 });
  const h2 = cleanBoard.history.list.length;
  assert(h2 - h1 <= 1, "连续透明度调整合并为一条历史");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
