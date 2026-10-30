import { useRef, useState, type MouseEvent } from "react";
import { applyDamage, applyHeal, parseAmount } from "./hp";

// ダメージ・回復の量を入力して現在 HP・一時 HP を更新する。変わった項目だけ保存する。
export function HpAdjuster(props: { current: string; temp: string; max: string; setField(name: string, value: string): void }) {
  const { current, temp, max, setField } = props;
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const amount = parseAmount(draft);

  function apply(e: MouseEvent, next: { current: string; temp: string }) {
    if (next.current !== current) setField("current_hp", next.current);
    if (next.temp !== temp) setField("temp_hp", next.temp);
    setDraft("");
    // 入力欄が空になるとボタンが無効になるので、キーボード操作ならフォーカスを戻す
    if (e.detail === 0) inputRef.current?.focus();
  }

  return (
    <div className="hp-adjust">
      <label className="item">
        <span className="lbl">HP 増減量</span>
        <input ref={inputRef} className="ei" inputMode="numeric" value={draft} onChange={(e) => setDraft(e.target.value)} />
      </label>
      <button type="button" disabled={amount === null} onClick={(e) => apply(e, applyDamage({ current, temp }, amount!))}>
        ダメージ
      </button>
      <button type="button" disabled={amount === null} onClick={(e) => apply(e, { current: applyHeal({ current, max }, amount!), temp })}>
        回復
      </button>
    </div>
  );
}
