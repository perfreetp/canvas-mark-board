import "./setup";
import MarkBoard from "../../package/canvas-mark-board/index";

let passed = 0, failed = 0;
function assert(cond: any, message: string) {
  if (cond) passed++;
  else { failed++; console.error("  ✗", message); }
}
function key(code: string, opts: any = {}) {
  return {
    code, key: opts.key || code.replace(/^Key/, ""),
    ctrlKey: !!opts.ctrl, metaKey: !!opts.meta, shiftKey: !!opts.shift,
    preventDefault() {}, target: null,
  } as unknown as KeyboardEvent;
}
function me(x: number, y: number, opts: any = {}) {
  return { button:0, buttons:1, offsetX:x, offsetY:y, x, y,
    shiftKey:!!opts.shift, ctrlKey:false, metaKey:false,
    preventDefault(){}, target:null } as unknown as MouseEvent;
}
async function tick(ms = 10) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const board: any = new MarkBoard({ view: "#t2-box" });
  board.on("oncomplete", (e: any) => e.ok({ label: "poly", color: "#123456" }));

  /* polygon 绘制：点击 3 个点 + 双击第一个点附近完成 */
  await board.setDrawType("polygon");
  board.appMousedown(me(100, 100));
  board.appMousemove(me(150, 100));
  board.appMousedown(me(200, 100));
  board.appMousemove(me(200, 200));
  board.appMousedown(me(200, 200));
  board.appMousemove(me(100, 200));
  // 回到起点附近点击闭合
  board.appMousedown(me(102, 102));
  await tick(20);
  assert(board.objects.length === 1, "多边形闭合后生成 1 个对象");
  const pid = board.objects[0].id;

  /* Esc 取消绘制：开始绘制另一个多边形然后 Esc */
  await board.setDrawType("polygon");
  board.appMousedown(me(300, 300));
  assert(
    board.markObjectList.some((o: any) => o.status === "draw"),
    "存在绘制中的对象"
  );
  board.windowKeydown(key("Escape"));
  assert(
    !board.markObjectList.some((o: any) => o.status === "draw"),
    "Esc 取消绘制中的对象"
  );
  assert(board.objects.length === 1, "取消绘制不增加对象");
  assert(board.currentDrawingType === "", "Esc 后退出绘制模式");

  /* 多边形拖动移动 */
  board.setDrawType("");
  board.appMousedown(me(150, 120)); // 多边形内部
  assert(board.isSelected(pid), "多边形可点选");
  const px = board.objects[0].pointList[0].x;
  board.appMousemove(me(160, 120));
  board.appMouseup(me(160, 120));
  assert(
    Math.abs(board.objects[0].pointList[0].x - (px + 10)) < 0.001,
    "多边形整体拖动 dx=10"
  );
  board.undo();
  assert(
    Math.abs(board.objects[0].pointList[0].x - px) < 0.001,
    "撤销拖动恢复多边形位置"
  );

  /* Ctrl+A 全选 */
  board.windowKeydown(key("KeyA", { ctrl: true }));
  assert(board.selectedIds.length === 1, "Ctrl+A 选中全部（1 个）");

  /* Delete 键删除 */
  board.windowKeydown(key("Delete"));
  assert(board.objects.length === 0, "Delete 键删除选中");
  board.windowKeydown(key("KeyZ", { ctrl: true }));
  assert(board.objects.length === 1, "Ctrl+Z 撤销删除");
  board.windowKeydown(key("KeyZ", { ctrl: true, shift: true }));
  assert(board.objects.length === 0, "Ctrl+Shift+Z 重做");

  /* Cmd 键（meta）撤销 */
  board.windowKeydown(key("KeyZ", { meta: true }));
  assert(board.objects.length === 1, "Cmd+Z 撤销");

  /* 复制粘贴快捷键 */
  board.appMousedown(me(150, 120));
  board.appMouseup(me(150, 120));
  board.windowKeydown(key("KeyC", { ctrl: true }));
  board.windowKeydown(key("KeyV", { ctrl: true }));
  assert(board.objects.length === 2, "Ctrl+C/V 得到 2 个对象");
  board.undo();
  assert(board.objects.length === 1, "撤销粘贴");

  /* 锁定图层时框选不包含锁定层对象 */
  const lockLayer = board.addLayer({ name: "锁定层" });
  board.setActiveLayer(lockLayer);
  await board.setDrawType("rect");
  board.appMousedown(me(400, 400));
  board.appMousemove(me(500, 500));
  board.appMouseup(me(500, 500));
  await tick(20);
  assert(board.objects.length === 2, "锁定层对象已绘制");
  const lockedId = board.objects.find((o: any) => o.id !== pid).id;
  board.updateLayer(lockLayer, { locked: true });
  board.setDrawType("");
  board.appMousedown(me(50, 50));
  board.appMousemove(me(550, 550));
  board.appMouseup(me(550, 550));
  assert(
    board.selectedIds.length === 1 && board.selectedIds[0] === pid,
    "框选不包含锁定图层对象"
  );

  /* 隐藏图层时框选同样排除 */
  board.updateLayer(lockLayer, { locked: false, visible: false });
  board.appMousedown(me(50, 50));
  board.appMousemove(me(550, 550));
  board.appMouseup(me(550, 550));
  assert(
    board.selectedIds.length === 1,
    "框选不包含隐藏图层对象"
  );

  /* 锁定后图层内对象不能整体拖动（尝试点击无反应） */
  board.updateLayer(lockLayer, { visible: true, locked: true });
  board.appMousedown(me(450, 450));
  board.appMouseup(me(450, 450));
  assert(!board.isSelected(lockedId), "锁定层对象点击不被选中");

  /* 文本框聚焦时快捷键不触发 */
  const beforeCount = board.objects.length;
  board.windowKeydown({
    code: "Delete", key: "Delete", ctrlKey: false, metaKey: false,
    shiftKey: false, preventDefault(){},
    target: { tagName: "INPUT" },
  } as unknown as KeyboardEvent);
  assert(
    board.objects.length === beforeCount,
    "输入框聚焦时 Delete 不删除标注"
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
