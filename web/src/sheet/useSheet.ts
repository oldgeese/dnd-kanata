import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { onValue, ref, serverTimestamp, update } from "firebase/database";
import {
  computeDerived,
  decodeRecord,
  encodeKey,
  type Derived,
  type Fields,
  type FormSchema,
  type Sheet,
} from "@dnd-kanata/core/browser";
import { db } from "../firebase";

export type SaveState = "saved" | "saving" | "offline" | "error";

const DEBOUNCE_MS = 500;

interface Pending {
  overlay: Fields; // まだ保存が確認できていないローカルの値。表示ではリモートより優先する
  dirty: Set<string>; // 次の update で送る項目
  inflight: number;
  failed: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
  mounted: boolean;
}

export function useSheet(sheetId: string): {
  status: "loading" | "not-found" | "ready";
  sheet: Sheet | null;
  derived: Record<string, Derived>;
  setField(name: string, value: string): void;
  saveState: SaveState;
  retry(): void;
} {
  const [remote, setRemote] = useState<Sheet | null>(null);
  const [status, setStatus] = useState<"loading" | "not-found" | "ready">("loading");
  const [connected, setConnected] = useState(true);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const p = useRef<Pending>({ overlay: {}, dirty: new Set(), inflight: 0, failed: false, timer: undefined, mounted: true });

  useEffect(() => {
    setStatus("loading");
    setRemote(null);
    const notFound = () => {
      setRemote(null);
      setStatus("not-found");
    };
    return onValue(
      ref(db, `sheets/${sheetId}`),
      (snap) => {
        const v = snap.val() as Sheet | null;
        if (!v) return notFound();
        setRemote({ ...v, fields: decodeRecord(v.fields ?? {}), schema: decodeRecord<FormSchema[string]>(v.schema ?? {}) });
        setStatus("ready");
      },
      notFound, // 共有されていない・存在しないシートはルールで読み取りが拒否される
    );
  }, [sheetId]);

  useEffect(() => onValue(ref(db, ".info/connected"), (snap) => setConnected(snap.val() === true)), []);

  const flush = useCallback(() => {
    const s = p.current;
    clearTimeout(s.timer);
    s.timer = undefined;
    if (!s.dirty.size) return;
    const sent: Fields = {};
    for (const k of s.dirty) sent[k] = s.overlay[k];
    s.dirty.clear();
    s.inflight++;
    s.failed = false;
    if (s.mounted) rerender();

    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(sent)) payload[`fields/${encodeKey(k)}`] = v;
    payload.updatedAt = serverTimestamp();
    update(ref(db, `sheets/${sheetId}`), payload)
      .then(
        () => {
          // Realtime Database は書き込みを即座にローカルのスナップショットへ反映するため、
          // 確定した項目は overlay から外してリモートの値に任せる（以後の他端末の変更を隠さない）
          const next = { ...s.overlay };
          for (const [k, v] of Object.entries(sent)) if (next[k] === v && !s.dirty.has(k)) delete next[k];
          s.overlay = next;
        },
        () => {
          for (const k of Object.keys(sent)) s.dirty.add(k); // retry() で同じ内容を送り直す
          s.failed = true;
        },
      )
      .finally(() => {
        s.inflight--;
        if (s.mounted) rerender();
      });
  }, [sheetId]);

  useEffect(() => {
    const s = p.current;
    s.mounted = true;
    return () => {
      s.mounted = false;
      flush(); // 画面を離れるときに未送信の変更を送る
    };
  }, [flush]);

  const setField = useCallback(
    (name: string, value: string) => {
      const s = p.current;
      s.overlay = { ...s.overlay, [name]: value };
      s.dirty.add(name);
      clearTimeout(s.timer);
      s.timer = setTimeout(flush, DEBOUNCE_MS);
      rerender();
    },
    [flush],
  );

  const overlay = p.current.overlay;
  const sheet = useMemo(() => (remote ? { ...remote, fields: { ...remote.fields, ...overlay } } : null), [remote, overlay]);
  const derived = useMemo(() => (sheet ? computeDerived(sheet.fields) : {}), [sheet]);

  const s = p.current;
  const saveState: SaveState = !connected ? "offline" : s.failed ? "error" : s.dirty.size || s.inflight ? "saving" : "saved";

  return { status, sheet, derived, setField, saveState, retry: flush };
}
