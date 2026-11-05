import { createContext, useContext, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { closestCenter, DndContext, PointerSensor, useDndMonitor, useSensor, useSensors, type CollisionDetection } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// 行を上下に並べ替えるための入れ物。ドラッグ（マウス・タッチ）は dnd-kit、キーボードは掴む場所の ↑/↓ で行う。
// 行の並びそのものは呼び出し側が onMove で値を入れ替えて反映する（行の key はスロット番号のまま変わらない）。
//
// DndContext はスクリーンリーダー向けの live region を 1 つずつ作るので、シート全体で 1 つ（SortableScope）にして、
// リスト（SortableRows）ごとに SortableContext を分ける。行はほかのリストへは動かせない。

const ScopeCtx = createContext(false);

interface Ctx {
  list: string;
  ids: number[];
  move(from: number, to: number): void;
  handles: Map<number, HTMLButtonElement>;
}
const RowsCtx = createContext<Ctx | null>(null);

// dnd-kit の ID はスコープ全体で一意にする必要があるので、スロット番号にリストの ID を付ける
const dndId = (list: string, slot: number) => `${list}:${slot}`;

const ACCESSIBILITY = {
  screenReaderInstructions: { draggable: "↑ キーと ↓ キーで並べ替えます。" },
  announcements: {
    onDragStart: () => "行を掴みました。",
    onDragOver: () => undefined,
    onDragEnd: ({ over }: { over: unknown }) => (over ? "行を動かしました。" : "並べ替えをやめました。"),
    onDragCancel: () => "並べ替えをやめました。",
  },
};

// 掴んだ行と同じリストの行だけを落とし先の候補にする
const sameList: CollisionDetection = (args) => {
  const list = args.active.data.current?.sortable?.containerId;
  return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.data.current?.sortable?.containerId === list) });
};

/** 並べ替えを使う範囲。enabled が false なら中の SortableRows は普通の行として出す */
export function SortableScope({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  // 掴む場所だけで始めるので、少し動かしたら掴む（タップでのフォーカスと区別する）
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  if (!enabled) return <>{children}</>;
  return (
    <ScopeCtx.Provider value={true}>
      <DndContext sensors={sensors} collisionDetection={sameList} accessibility={ACCESSIBILITY} onDragStart={commitEditing}>
        {children}
      </DndContext>
    </ScopeCtx.Provider>
  );
}

// 編集中の入力欄は、行の値を入れ替える前に確定させる。入力欄の下書きはスロットに結びついているので、
// 入れ替えた後で確定すると別の行の値を上書きしてしまう（タッチで掴んだときは入力欄のフォーカスが外れないことがある）
function commitEditing() {
  const el = document.activeElement;
  if (el instanceof HTMLElement && el.matches("input, textarea, select")) el.blur();
}

type RowsProps = {
  ids: number[]; // 並べ替えられる行のスロット番号（表示順）
  onMove(from: number, to: number): void; // ids の添字で、from の行を to へ動かす
  children: ReactNode;
};

export function SortableRows(props: RowsProps) {
  if (!useContext(ScopeCtx)) return <>{props.children}</>;
  return <ActiveRows {...props} />;
}

function ActiveRows({ ids, onMove, children }: RowsProps) {
  const list = useId();
  const handles = useRef(new Map<number, HTMLButtonElement>()).current;
  const keys = ids.map((i) => dndId(list, i));
  useDndMonitor({
    onDragEnd({ active, over }) {
      if (!over) return;
      const from = keys.indexOf(String(active.id));
      const to = keys.indexOf(String(over.id));
      if (from >= 0 && to >= 0 && from !== to) onMove(from, to);
    },
  });
  return (
    <RowsCtx.Provider value={{ list, ids, move: onMove, handles }}>
      <SortableContext id={list} items={keys} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </RowsCtx.Provider>
  );
}

type RowProps = {
  id: number;
  as: "li" | "tr";
  label: string; // 掴む場所の名前（「〜 を並べ替え」と続ける）
  className?: string;
  children: (handle: ReactNode) => ReactNode; // handle は行の先頭に置く
};

export function SortableRow(props: RowProps) {
  const ctx = useContext(RowsCtx);
  // 並べ替えを使うかどうかは画面ごとに決まり、行の中では変わらない
  if (!ctx) return <props.as className={props.className}>{props.children(null)}</props.as>;
  return <ActiveRow {...props} ctx={ctx} />;
}

// 空の行に値が入ると並べ替えられる行に変わる。そのときに行を作り直すと入力中のフォーカスが失われるので、
// 並べ替えられない行も同じコンポーネントで出し、掴む場所だけを出し分ける。
function ActiveRow({ id, as: Tag, label, className, children, ctx }: RowProps & { ctx: Ctx }) {
  const sortable = ctx.ids.includes(id);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: dndId(ctx.list, id),
    disabled: !sortable,
  });

  function onKeyDown(e: KeyboardEvent) {
    const step = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!step) return;
    e.preventDefault();
    const from = ctx.ids.indexOf(id);
    const to = from + step;
    if (to < 0 || to >= ctx.ids.length) return;
    ctx.move(from, to);
    // 行の中身が入れ替わるだけで要素は動かないので、動かした先の行へフォーカスを移す
    ctx.handles.get(ctx.ids[to])?.focus();
  }

  const button = sortable && (
    <button
      type="button"
      className="drag-handle"
      {...attributes}
      {...listeners}
      ref={(el) => {
        setActivatorNodeRef(el);
        if (el) ctx.handles.set(id, el);
        else ctx.handles.delete(id);
      }}
      aria-label={`${label} を並べ替え`}
      onKeyDown={onKeyDown}
    >
      <span aria-hidden="true">⋮⋮</span>
    </button>
  );
  return (
    <Tag ref={setNodeRef} className={cls(className, "sortable", isDragging && "dragging")} style={{ transform: CSS.Translate.toString(transform), transition }}>
      {children(Tag === "tr" ? <td className="drag-cell">{button}</td> : button)}
    </Tag>
  );
}

function cls(...names: (string | false | undefined)[]): string | undefined {
  return names.filter(Boolean).join(" ") || undefined;
}
