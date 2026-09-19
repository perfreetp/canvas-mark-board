import React from "react";
import type MarkBoard from "canvas-mark-board";

interface HistoryBarProps {
  list: { label: string; time: number }[];
  index: number;
  canUndo: boolean;
  canRedo: boolean;
  board: MarkBoard | null;
  onRefresh: () => void;
}

/**
 * 历史操作栏：撤销 / 重做 / 跳转到任意历史节点
 */
export default function HistoryBar(props: HistoryBarProps) {
  const { list, index, canUndo, canRedo, board, onRefresh } = props;
  return (
    <div className="history-bar">
      <div className="history-actions">
        <button
          disabled={!canUndo}
          onClick={() => {
            board?.undo();
            onRefresh();
          }}
          title="撤销 Ctrl/Cmd+Z"
        >
          ↶ 撤销
        </button>
        <button
          disabled={!canRedo}
          onClick={() => {
            board?.redo();
            onRefresh();
          }}
          title="重做 Ctrl/Cmd+Shift+Z"
        >
          ↷ 重做
        </button>
      </div>
      <div className="history-list">
        {list.map((entry, i) => {
          const time = new Date(entry.time);
          const hhmmss = `${String(time.getHours()).padStart(2, "0")}:${String(
            time.getMinutes()
          ).padStart(2, "0")}:${String(time.getSeconds()).padStart(2, "0")}`;
          return (
            <button
              key={`${entry.time}-${i}`}
              className={`history-item${i === index ? " current" : ""}${
                i > index ? " future" : ""
              }`}
              title={`${entry.label} · ${hhmmss}`}
              onClick={() => {
                board?.goHistory(i);
                onRefresh();
              }}
            >
              {i === index ? "▶ " : ""}
              {entry.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
