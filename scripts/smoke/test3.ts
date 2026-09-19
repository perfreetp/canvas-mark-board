import "./setup";
import MarkBoard from "../../package/canvas-mark-board/index";
import {
  MarkDotObject,
  MarkTriangleObject,
  MarkRotateRectObject,
} from "../../play/custom-mark/index";

let passed = 0, failed = 0;
function assert(cond: any, m: string) { cond ? passed++ : (failed++, console.error("  ✗", m)); }
function me(x:number,y:number,o:any={}){return {button:0,buttons:1,offsetX:x,offsetY:y,x,y,shiftKey:!!o.shift,ctrlKey:false,metaKey:false,preventDefault(){},target:null} as unknown as MouseEvent;}
async function tick(ms=10){return new Promise(r=>setTimeout(r,ms));}

async function main(){
  const board:any = new MarkBoard({view:"#t3-box"});
  board.register("dot", MarkDotObject);
  board.register("triangle", MarkTriangleObject);
  board.register("rotateRect", MarkRotateRectObject);
  board.on("oncomplete",(e:any)=>e.ok({label:"x",color:"#abcdef"}));

  // rotateRect：带旋转信息（先导入）
  board.importData({
    layers:[{id:"default",name:"默认图层",visible:true,locked:false,opacity:1}],
    objects:[{
      id:"rr1", label:"r", color:"#112233", type:"rotateRect", layerId:"default",
      rotation: 45,
      pointList:[{x:200,y:200},{x:300,y:300}],
    }],
  });
  assert(board.objects.length===1,"导入 rotateRect 后 1 个对象");
  const rr0chk = board.markObjectList.find((o:any)=>o.id==="rr1");
  assert(rr0chk.rotation===45,"rotateRect 旋转信息保留");

  // dot：单击完成（追加到当前数据）
  await board.setDrawType("dot");
  board.appMousedown(me(100,100));
  board.appMouseup(me(100,100));
  await tick(20);
  assert(board.objects.length===2,`dot 单点绘制完成后共 2 个（实际 ${board.objects.length}）`);
  const dotId = board.objects.find((o:any)=>o.type==="dot").id;

  // 导出含 rotation
  const exp = board.exportData();
  const rrJson = exp.objects.find((o:any)=>o.id==="rr1");
  assert(rrJson.rotation===45,"导出含 rotation");

  // 多选：dot + rotateRect 一起拖动
  board.setDrawType("");
  board.appMousedown(me(40,40));
  board.appMousemove(me(400,400));
  board.appMouseup(me(400,400));
  assert(board.selectedIds.length===2,`框选自定义对象 2 个（实际 ${board.selectedIds.length}）`);
  const d0 = board.objects.find((o:any)=>o.id===dotId).pointList[0];
  const rr0 = board.objects.find((o:any)=>o.id==="rr1").pointList[0];
  // 从 dot 处按下整体拖动
  board.appMousedown(me(100,100));
  board.appMousemove(me(110,100));
  board.appMouseup(me(110,100));
  const d1 = board.objects.find((o:any)=>o.id===dotId).pointList[0];
  const rr1p = board.objects.find((o:any)=>o.id==="rr1").pointList[0];
  assert(Math.abs(d1.x-d0.x-10)<0.001,"dot 随多选移动 dx=10");
  assert(Math.abs(rr1p.x-rr0.x-10)<0.001,"rotateRect 随多选移动 dx=10");
  assert(board.objects.find((o:any)=>o.id==="rr1").rotation===45,"移动后旋转信息保留");

  // 撤销移动，两者一起恢复
  board.undo();
  const d2 = board.objects.find((o:any)=>o.id===dotId).pointList[0];
  const rr2 = board.objects.find((o:any)=>o.id==="rr1").pointList[0];
  assert(Math.abs(d2.x-d0.x)<0.001,"撤销：dot 位置恢复");
  assert(Math.abs(rr2.x-rr0.x)<0.001,"撤销：rotateRect 位置恢复");

  // 隐藏图层时 dot 不绘制不选中
  board.updateLayer("default",{visible:false});
  assert(!board.getObjectAtPoint({x:100,y:100}),"隐藏后 dot 不可点选");
  assert(!board.getObjectAtPoint({x:250,y:250}),"隐藏后 rotateRect 不可点选");
  board.undo();

  // 锁定时同样
  board.updateLayer("default",{locked:true});
  assert(!board.getObjectAtPoint({x:100,y:100}),"锁定后 dot 不可点选");
  board.undo();

  // 删除 dot 的撤销/重做
  board.setSelected([dotId]);
  board.deleteObjects();
  assert(board.objects.length===1,"删除 dot");
  board.undo();
  assert(board.objects.length===2,"撤销删除 dot 恢复");

  console.log(`\n${passed} passed, ${failed} failed`);
  if(failed) process.exit(1);
}
main().catch(e=>{console.error(e);process.exit(1);});
