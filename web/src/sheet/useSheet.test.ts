import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSheet } from "./useSheet";

type Snap = { val(): unknown };
type Listener = { cb: (s: Snap) => void; err?: (e: Error) => void };

const listeners = new Map<string, Listener>();
const update = vi.fn();
const TS = { ".sv": "timestamp" };

vi.mock("../firebase", () => ({ db: {} }));
vi.mock("firebase/database", () => ({
  ref: (_db: unknown, path: string) => path,
  onValue: (path: string, cb: Listener["cb"], err?: Listener["err"]) => {
    listeners.set(path, { cb, err });
    return () => listeners.delete(path);
  },
  update: (...args: unknown[]) => update(...args),
  serverTimestamp: () => TS,
}));

function emit(path: string, value: unknown) {
  act(() => listeners.get(path)!.cb({ val: () => value }));
}

const SHEET = {
  ownerUid: "u1",
  sourceId: 54555,
  shared: false,
  fields: { dex: "14", char_name: "カタナ", "a%2Eb": "x" },
  schema: { dex: { kind: "text", order: 0 }, char_name: { kind: "text", order: 1 }, "a%2Eb": { kind: "text", order: 2 } },
  sourceLastUpdate: "2026/05/02 11:05",
  importedAt: 1,
  updatedAt: 1,
};

function setup() {
  const hook = renderHook(() => useSheet("s1"));
  emit(".info/connected", true);
  emit("sheets/s1", SHEET);
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers();
  listeners.clear();
  update.mockReset();
  update.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useSheet", () => {
  it("is loading until the sheet arrives, then decodes it", () => {
    const { result } = renderHook(() => useSheet("s1"));
    expect(result.current.status).toBe("loading");
    emit(".info/connected", true);
    emit("sheets/s1", SHEET);
    expect(result.current.status).toBe("ready");
    expect(result.current.sheet!.fields["a.b"]).toBe("x");
    expect(result.current.sheet!.schema["a.b"]).toEqual({ kind: "text", order: 2 });
    expect(result.current.derived.dex_mod.value).toBe("2");
    expect(result.current.saveState).toBe("saved");
  });

  it("applies setField immediately and saves after 500ms", async () => {
    const { result } = setup();
    act(() => result.current.setField("dex", "20"));
    expect(result.current.sheet!.fields.dex).toBe("20");
    expect(result.current.derived.dex_mod.value).toBe("5");
    expect(result.current.saveState).toBe("saving");
    expect(update).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(499));
    expect(update).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith("sheets/s1", { "fields/dex": "20", updatedAt: TS });
    expect(result.current.saveState).toBe("saved");
  });

  it("coalesces rapid changes into one update after the last change", async () => {
    const { result } = setup();
    act(() => result.current.setField("dex", "15"));
    await act(() => vi.advanceTimersByTimeAsync(300));
    act(() => result.current.setField("dex", "16"));
    await act(() => vi.advanceTimersByTimeAsync(300));
    act(() => result.current.setField("char_name", "ミナ"));
    await act(() => vi.advanceTimersByTimeAsync(499));
    expect(update).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith("sheets/s1", { "fields/dex": "16", "fields/char_name": "ミナ", updatedAt: TS });
  });

  it("encodes keys when saving", async () => {
    const { result } = setup();
    act(() => result.current.setField("a.b", "y"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(update).toHaveBeenCalledWith("sheets/s1", { "fields/a%2Eb": "y", updatedAt: TS });
  });

  it("reports error on rejection and retry() resends the same content", async () => {
    update.mockRejectedValueOnce(new Error("PERMISSION_DENIED"));
    const { result } = setup();
    act(() => result.current.setField("dex", "20"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(result.current.saveState).toBe("error");
    // 失敗しても画面上の値は残す
    emit("sheets/s1", SHEET);
    expect(result.current.sheet!.fields.dex).toBe("20");

    await act(async () => result.current.retry());
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1]).toEqual(update.mock.calls[0]);
    expect(result.current.saveState).toBe("saved");
  });

  it("is offline while .info/connected is false", () => {
    const { result } = setup();
    emit(".info/connected", false);
    expect(result.current.saveState).toBe("offline");
    emit(".info/connected", true);
    expect(result.current.saveState).toBe("saved");
  });

  it("keeps a locally changed value when an older remote snapshot arrives", async () => {
    let resolve!: () => void;
    update.mockReturnValueOnce(new Promise<void>((r) => (resolve = r)));
    const { result } = setup();
    act(() => result.current.setField("dex", "20"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    emit("sheets/s1", { ...SHEET, fields: { ...SHEET.fields, char_name: "別名" } });
    expect(result.current.sheet!.fields.dex).toBe("20");
    expect(result.current.sheet!.fields.char_name).toBe("別名");
    await act(async () => resolve());
    emit("sheets/s1", { ...SHEET, fields: { ...SHEET.fields, dex: "20" } });
    expect(result.current.sheet!.fields.dex).toBe("20");
  });

  it("flushes pending changes on unmount", () => {
    const { result, unmount } = setup();
    act(() => result.current.setField("dex", "20"));
    unmount();
    expect(update).toHaveBeenCalledWith("sheets/s1", { "fields/dex": "20", updatedAt: TS });
  });

  it.each([
    ["null", (path: string) => emit(path, null)],
    ["permission denied", (path: string) => act(() => listeners.get(path)!.err!(new Error("permission_denied")))],
  ])("is not-found when the sheet cannot be read (%s)", (_, fail) => {
    const { result } = renderHook(() => useSheet("s1"));
    fail("sheets/s1");
    expect(result.current.status).toBe("not-found");
    expect(result.current.sheet).toBeNull();
  });
});
