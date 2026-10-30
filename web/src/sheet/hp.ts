// 数値でない値は 0 とみなす
const toNumber = (value: string) => {
  const n = parseInt(value);
  return isNaN(n) ? 0 : n;
};

/** 一時 HP から先に減らし、残りを現在 HP から引く。減らなかった項目は元の文字列のまま返す */
export function applyDamage(hp: { current: string; temp: string }, amount: number): { current: string; temp: string } {
  const temp = Math.max(toNumber(hp.temp), 0);
  const absorbed = Math.min(temp, amount);
  const rest = amount - absorbed;
  return {
    current: rest > 0 ? String(Math.max(toNumber(hp.current) - rest, 0)) : hp.current,
    temp: absorbed > 0 ? String(temp - absorbed) : hp.temp,
  };
}

/** 現在 HP に足す。上限は最大 HP（空欄なら上限なし）で、すでに超えている現在 HP は下げない */
export function applyHeal(hp: { current: string; max: string }, amount: number): string {
  const current = toNumber(hp.current);
  const healed = current + amount;
  const max = parseInt(hp.max);
  return String(isNaN(max) ? healed : Math.max(current, Math.min(max, healed)));
}

/** 増減量の入力を 1 以上の整数にする（全角数字も可）。それ以外は null */
export function parseAmount(raw: string): number | null {
  const s = raw.normalize("NFKC").trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && Number.isSafeInteger(n) ? n : null;
}
