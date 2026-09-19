import type { IHistoryEntry, IHistorySnapshot } from "../types";

/** 连续同类操作合并的时间窗口（ms） */
const COALESCE_WINDOW = 800;

interface IHistoryRecord {
  entry: IHistoryEntry;
  snapshot: IHistorySnapshot;
  /** 合并键：相邻且相同 key 的记录在时间窗口内合并 */
  coalesceKey?: string;
}

/**
 * 操作历史：基于快照的撤销/重做
 */
export default class MarkHistory {
  /** 已提交的历史节点（含初始状态） */
  records: IHistoryRecord[] = [];
  /** 当前指向的节点下标 */
  index = -1;
  /** 最大节点数量 */
  limit = 100;

  /** 正在进行中的操作（mousedown 到 mouseup 等） */
  private pending: {
    label: string;
    snapshot: IHistorySnapshot;
    time: number;
    coalesceKey?: string;
  } | null = null;

  constructor(initial?: IHistorySnapshot) {
    if (initial) {
      this.records = [
        {
          entry: { label: "初始状态", time: Date.now() },
          snapshot: this.clone(initial),
        },
      ];
      this.index = 0;
    }
  }

  get list(): IHistoryEntry[] {
    return this.records.map((item) => item.entry);
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.records.length - 1;
  }

  private clone(snapshot: IHistorySnapshot): IHistorySnapshot {
    return JSON.parse(JSON.stringify(snapshot));
  }

  /**
   * 开启一次操作，记录操作前的快照。
   * coalesceKey 相同且在时间窗口内的 begin 复用同一前序快照，
   * 从而把连续输入、透明度拖动等合并成一条历史。
   */
  begin(
    label: string,
    snapshot: IHistorySnapshot,
    coalesceKey?: string
  ): void {
    const now = Date.now();
    if (
      this.pending &&
      coalesceKey &&
      this.pending.coalesceKey === coalesceKey &&
      now - this.pending.time < COALESCE_WINDOW
    ) {
      this.pending.time = now;
      this.pending.label = label;
      return;
    }
    this.pending = {
      label,
      snapshot: this.clone(snapshot),
      time: now,
      coalesceKey,
    };
  }

  /** 提交操作，传入操作后的快照 */
  commit(snapshot: IHistorySnapshot): void {
    if (!this.pending) {
      return;
    }
    const record = this.pending;
    this.pending = null;
    this.applyPush(
      record.label,
      record.snapshot,
      this.clone(snapshot),
      record.coalesceKey
    );
  }

  /** 取消正在进行的操作 */
  cancel(): void {
    this.pending = null;
  }

  /**
   * 直接压入一条历史。
   * - 传 before 与 after：按一次完整操作记录；
   * - 仅传 after：以当前节点快照作为操作前快照。
   */
  push(
    label: string,
    before: IHistorySnapshot,
    after?: IHistorySnapshot,
    coalesceKey?: string
  ): void {
    this.applyPush(
      label,
      this.clone(before),
      this.clone(after || before),
      coalesceKey
    );
  }

  private applyPush(
    label: string,
    before: IHistorySnapshot,
    after: IHistorySnapshot,
    coalesceKey?: string
  ): void {
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return;
    }
    // 开启新分支时丢弃 redo 部分
    this.records = this.records.slice(0, this.index + 1);
    const now = Date.now();
    const last = this.records[this.records.length - 1];
    if (
      coalesceKey &&
      last &&
      last.coalesceKey === coalesceKey &&
      now - last.entry.time < COALESCE_WINDOW
    ) {
      // 合并连续同类操作，保留最早的“操作前”快照与时间
      this.records[this.records.length - 1] = {
        entry: { label, time: last.entry.time },
        snapshot: this.clone(after),
        coalesceKey,
      };
    } else {
      this.records.push({
        entry: { label, time: now },
        snapshot: this.clone(after),
        coalesceKey,
      });
    }
    if (this.records.length > this.limit) {
      this.records.shift();
    }
    this.index = this.records.length - 1;
  }

  currentSnapshot(): IHistorySnapshot | undefined {
    return this.records[this.index]?.snapshot;
  }

  undo(): IHistorySnapshot | undefined {
    if (!this.canUndo) return undefined;
    this.pending = null;
    this.index -= 1;
    return this.clone(this.records[this.index].snapshot);
  }

  redo(): IHistorySnapshot | undefined {
    if (!this.canRedo) return undefined;
    this.pending = null;
    this.index += 1;
    return this.clone(this.records[this.index].snapshot);
  }

  /** 跳转到指定历史节点（历史栏点击） */
  goTo(targetIndex: number): IHistorySnapshot | undefined {
    if (targetIndex < 0 || targetIndex > this.records.length - 1) {
      return undefined;
    }
    this.pending = null;
    this.index = targetIndex;
    return this.clone(this.records[targetIndex].snapshot);
  }

  clear(initial?: IHistorySnapshot): void {
    this.pending = null;
    this.records = initial
      ? [
          {
            entry: { label: "初始状态", time: Date.now() },
            snapshot: this.clone(initial),
          },
        ]
      : [];
    this.index = initial ? 0 : -1;
  }
}
