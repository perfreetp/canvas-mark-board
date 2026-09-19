import "./setup";
import MarkBoard from "../../package/canvas-mark-board/index";
let p=0,f=0;
const assert=(c:any,m:string)=>c?p++:(f++,console.error("  ✗",m));
function me(x:number,y:number){return {button:0,buttons:1,offsetX:x,offsetY:y,x,y,shiftKey:false,ctrlKey:false,metaKey:false,preventDefault(){},target:null} as unknown as MouseEvent;}
async function tick(ms=10){return new Promise(r=>setTimeout(r,ms));}
async function main(){
  const board:any = new MarkBoard({view:"#t4"});
  board.on("oncomplete",(e:any)=>e.ok({label:"a",color:"#f00"}));
  // 画两个矩形
  await board.setDrawType("rect");
  board.appMousedown(me(100,100)); board.appMousemove(me(200,200)); board.appMouseup(me(200,200)); await tick();
  board.appMousedown(me(300,300)); board.appMousemove(me(400,400)); board.appMouseup(me(400,400)); await tick();
  assert(board.objects.length===2,"两个矩形");

  // 顶点调整矩形（矩形 1：对角点 200,200，拖到 230,240）
  board.setDrawType("");
  board.appMousedown(me(150,150)); // 选中并整体拖动（点在内部）
  board.appMouseup(me(150,150));
  // 移动到顶点 200,200 附近按下
  board.appMousedown(me(200,200));
  const isVertex = board.selectObject.acctivePointIndex;
  board.appMousemove(me(230,240));
  board.appMouseup(me(230,240));
  const rect1 = board.objects.find((o:any)=>o.id===board.objects[0].id);
  assert(rect1.pointList[1].x===230 && rect1.pointList[1].y===240,`矩形顶点调整（顶点idx=${isVertex}），p2=${JSON.stringify(rect1.pointList[1])}`);
  // 撤销顶点调整
  board.undo();
  const r2 = board.objects[0];
  assert(r2.pointList[1].x===200 && r2.pointList[1].y===200,"撤销顶点调整");

  // 圆形绘制 + 调整
  await board.setDrawType("circle");
  board.appMousedown(me(500,100)); board.appMousemove(me(560,160)); board.appMouseup(me(560,160)); await tick();
  assert(board.objects.length===3,"圆形绘制完成");
  // 椭圆
  await board.setDrawType("ellipse");
  board.appMousedown(me(100,400)); board.appMousemove(me(180,460)); board.appMouseup(me(180,460)); await tick();
  assert(board.objects.length===4,"椭圆绘制完成");

  // 多边形回车完成
  await board.setDrawType("polygon");
  board.appMousedown(me(600,400));
  board.appMousedown(me(650,400));
  board.appMousedown(me(650,460));
  await (board.windowKeydown({code:"Enter",key:"Enter",ctrlKey:false,metaKey:false,shiftKey:false,preventDefault(){},target:null}));
  await tick(20);
  assert(board.objects.length===5,`回车完成多边形（实际 ${board.objects.length}）`);

  // 右键撤销最后一个点
  await board.setDrawType("polygon");
  board.appMousedown(me(600,100));
  board.appMousedown(me(650,100));
  board.appMousedown(me(650,160));
  const drawing = board.markObjectList.find((o:any)=>o.status==="draw");
  assert(drawing.pointList.length===3,"多边形绘制 3 点");
  drawing.boxContextmenu();
  assert(drawing.pointList.length===2,"右键撤销 1 点");
  // Esc 取消
  board.windowKeydown({code:"Escape",key:"Escape",ctrlKey:false,metaKey:false,shiftKey:false,preventDefault(){},target:null});
  assert(board.objects.length===5,"Esc 取消未完成多边形");

  // 平移（空格）不会触发框选
  board.windowKeydown({code:"Space",key:" ",ctrlKey:false,metaKey:false,shiftKey:false,preventDefault(){},target:null});
  assert(board.moveStatus===true,"空格进入平移");
  board.appMousedown(me(300,300));
  board.appMousemove(me(320,320));
  board.appMouseup(me(320,320));
  assert(board.selectedIds.length===0,"平移时不改变选择");
  board.windowKeyup({code:"Space",key:" ",ctrlKey:false,metaKey:false,shiftKey:false,preventDefault(){},target:null});

  // 单击空白取消选择
  board.appMousedown(me(150,150)); board.appMouseup(me(150,150));
  assert(board.selectedIds.length===1,"选中矩形1");
  board.appMousedown(me(50,50)); board.appMousemove(me(52,51)); board.appMouseup(me(52,51));
  assert(board.selectedIds.length===0,"空白点击（未拖成框）取消选择");

  console.log(`\n${p} passed, ${f} failed`);
  if(f) process.exit(1);
}
main().catch(e=>{console.error(e);process.exit(1);});
