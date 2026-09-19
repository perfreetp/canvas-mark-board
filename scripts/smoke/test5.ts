import "./setup";
import MarkBoard from "../../package/canvas-mark-board/index";
let p=0,f=0;
const assert=(c:any,m:string)=>c?p++:(f++,console.error("  ✗",m));
function me(x:number,y:number){return {button:0,buttons:1,offsetX:x,offsetY:y,x,y,shiftKey:false,ctrlKey:false,metaKey:false,preventDefault(){},target:null} as unknown as MouseEvent;}
async function tick(ms=10){return new Promise(r=>setTimeout(r,ms));}
async function main(){
  const board:any = new MarkBoard({view:"#t5"});
  board.on("oncomplete",(e:any)=>e.ok({label:"a",color:"#f00"}));
  await board.setDrawType("rect");
  board.appMousedown(me(100,100)); board.appMousemove(me(200,200)); board.appMouseup(me(200,200)); await tick();
  const stackAfterCreate = board.history.list.length;
  // 单击对象（按下+抬起，不移动）不应产生历史
  board.setDrawType("");
  board.appMousedown(me(150,150)); board.appMouseup(me(150,150));
  assert(board.history.list.length===stackAfterCreate,`单击不产生历史（${stackAfterCreate} -> ${board.history.list.length}）`);
  // 单击空白
  board.appMousedown(me(50,50)); board.appMousemove(me(51,50)); board.appMouseup(me(51,50));
  assert(board.history.list.length===stackAfterCreate,"空白点击不产生历史");
  // 移动 1px 以下阈值也可能产生历史（实际改变了坐标），这里移动 0 不算
  // 框选不产生历史
  board.appMousedown(me(80,80)); board.appMousemove(me(180,180)); board.appMouseup(me(180,180));
  assert(board.history.list.length===stackAfterCreate,"框选不产生历史");
  // 真正移动产生一条历史
  board.appMousedown(me(150,150)); board.appMousemove(me(160,150)); board.appMouseup(me(160,150));
  assert(board.history.list.length===stackAfterCreate+1,"实际移动产生 1 条历史");
  // 连续两次快速整体移动应各产生一条（跨 mousedown/up 不合并）
  board.appMousedown(me(160,150)); board.appMousemove(me(170,150)); board.appMouseup(me(170,150));
  assert(board.history.list.length===stackAfterCreate+2,`两次拖动产生 2 条历史（实际 ${board.history.list.length-stackAfterCreate}）`);
  console.log(`\n${p} passed, ${f} failed`);
  if(f) process.exit(1);
}
main().catch(e=>{console.error(e);process.exit(1);});
