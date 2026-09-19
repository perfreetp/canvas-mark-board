/** 轻量 DOM / Canvas 桩，供 node 下冒烟测试 */
function createCtxProxy() {
  const gradient = { addColorStop() {} };
  const target: any = () => {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "canvas") return { width: 800, height: 600 };
      if (prop === "measureText") return () => ({ width: 40 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient")
        return () => gradient;
      if (prop === "getContext") return () => ctx;
      // 数值/样式属性给默认值
      const value = () => {};
      return value;
    },
    set() {
      return true;
    },
  });
}
const ctx = createCtxProxy();

class FakeEventTarget {
  private listeners: Record<string, Function[]> = Object.create(null);
  addEventListener(type: string, fn: Function) {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener(type: string, fn: Function) {
    this.listeners[type] = (this.listeners[type] || []).filter(
      (f) => f !== fn
    );
  }
  dispatch(type: string, ...args: any[]) {
    (this.listeners[type] || []).forEach((f) => f(...args));
  }
}

class FakeElement extends FakeEventTarget {
  style: Record<string, string> = {};
  children: FakeElement[] = [];
  innerHTML = "";
  constructor(public tagName = "DIV", public id = "") {
    super();
  }
  appendChild(child: any) {
    this.children.push(child);
    return child;
  }
  insertBefore(child: any) {
    this.children.unshift(child);
    return child;
  }
  replaceWith() {}
  cloneNode() {
    return new FakeElement(this.tagName, this.id);
  }
  getBoundingClientRect() {
    return {
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON() {},
    };
  }
  setAttribute() {}
  getContext() {
    return ctx;
  }
  querySelector() {
    return null;
  }
}

const elements: Record<string, FakeElement> = {};
const documentStub = {
  createElement(tag: string) {
    const el = new FakeElement(tag);
    if (tag === "canvas") {
      (el as any).width = 800;
      (el as any).height = 600;
      (el as any).getContext = () => ctx;
    }
    return el;
  },
  querySelector(sel: string) {
    const id = String(sel).replace("#", "");
    if (!elements[id]) elements[id] = new FakeElement("DIV", id);
    return elements[id];
  },
};

class FakeWindow extends FakeEventTarget {}
const windowStub = new FakeWindow();
(windowStub as any).devicePixelRatio = 1;
(windowStub as any).Image = class {
  style: Record<string, string> = {};
  set src(_v: string) {}
  get src() {
    return "";
  }
  onload: Function | null = null;
};

(globalThis as any).Path2D = class {
  d = "";
  constructor(path?: any) {
    if (path && typeof path === "object" && "d" in path) this.d = (path as any).d;
    else if (typeof path === "string") this.d = path;
  }
  addPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  rect() {}
};
(globalThis as any).window = windowStub;
(globalThis as any).document = documentStub;
(globalThis as any).devicePixelRatio = 1;

export {};
