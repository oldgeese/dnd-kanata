import iconv from "iconv-lite";

const BASE = "https://dndjp.sakura.ne.jp";
export const USER_AGENT = "dnd-kanata (+https://github.com/oldgeese/dnd-kanata)";

export class SourceError extends Error {
  constructor(public code: "unavailable" | "not-found" | "unexpected-form", message?: string) {
    super(message ?? code);
    this.name = "SourceError";
  }
}

export function parseSourceId(input: string): number | null {
  const s = input.trim();
  if (/^[0-9]+$/.test(s)) return toId(s);
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "dndjp.sakura.ne.jp") return null;
  if (url.pathname !== "/INPUT_FORM.php" && url.pathname !== "/OUTPUT.php") return null;
  const id = url.searchParams.get("ID");
  return id !== null && /^[0-9]+$/.test(id) ? toId(id) : null;
}

function toId(digits: string): number | null {
  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function assertId(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0) throw new SourceError("not-found", "invalid id");
}

export async function fetchInputForm(id: number): Promise<string> {
  assertId(id);
  let res: Response;
  try {
    res = await fetch(`${BASE}/INPUT_FORM.php?ID=${id}`, { headers: { "User-Agent": USER_AGENT } });
  } catch {
    throw new SourceError("unavailable");
  }
  if (res.status !== 200) throw new SourceError("unavailable", `status ${res.status}`);
  return iconv.decode(Buffer.from(await res.arrayBuffer()), "cp932");
}

export async function postOutput(id: number, body: Buffer): Promise<string> {
  assertId(id);
  let res: Response;
  try {
    res = await fetch(`${BASE}/OUTPUT.php?ID=${id}`, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw new SourceError("unavailable");
  }
  if (res.status !== 200) throw new SourceError("unavailable", `status ${res.status}`);
  return iconv.decode(Buffer.from(await res.arrayBuffer()), "cp932");
}
