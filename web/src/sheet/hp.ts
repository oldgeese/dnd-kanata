// 整数として読めなければ null（全角数字も可）
const parseHp = (value: string): number | null => {
  const s = value.normalize("NFKC").trim();
  return /^-?\d+$/.test(s) ? Number(s) : null;
};

// 空欄は 0 とみなす
const toNumber = (value: string) => parseHp(value) ?? 0;

/** 増減の計算に使える値か（空欄または整数）。"20/30" のような値は上書きで失われるので使わない */
export function isHpValue(value: string): boolean {
  return value.trim() === "" || parseHp(value) !== null;
}

/** 一時 HP から先に減らし、残りを現在 HP から引く。減らなかった項目は元の文字列のまま返す */
export function applyDamage(hp: { current: string; temp: string }, amount: number): { current: string; temp: string } {
  const temp = Math.max(toNumber(hp.temp), 0);
  const absorbed = Math.min(temp, amount);
  const rest = amount - absorbed;
  const current = toNumber(hp.current);
  return {
    // 下限は 0 だが、すでに負の現在 HP をダメージで増やさない
    current: rest > 0 ? String(Math.min(current, Math.max(current - rest, 0))) : hp.current,
    temp: absorbed > 0 ? String(temp - absorbed) : hp.temp,
  };
}

/** 現在 HP に足す。上限は最大 HP（空欄や 0 以下なら上限なし）で、すでに超えている現在 HP は下げない */
export function applyHeal(hp: { current: string; max: string }, amount: number): string {
  const current = toNumber(hp.current);
  const healed = current + amount;
  const max = toNumber(hp.max);
  return String(max > 0 ? Math.max(current, Math.min(max, healed)) : healed);
}

/** 増減量の入力を 1 以上の整数にする（全角数字も可）。それ以外は null */
export function parseAmount(raw: string): number | null {
  const s = raw.normalize("NFKC").trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && Number.isSafeInteger(n) ? n : null;
}
