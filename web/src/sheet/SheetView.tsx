import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DERIVED_FIELDS, type Derived, type Fields, type FormSchema } from "@dnd-kanata/core/browser";
import { DerivedValue } from "./fields/DerivedValue";
import { EditableCheckbox } from "./fields/EditableCheckbox";
import { EditableNumber } from "./fields/EditableNumber";
import { EditableSelect } from "./fields/EditableSelect";
import { EditableText } from "./fields/EditableText";
import { EditableTextarea } from "./fields/EditableTextarea";
import { ABILITIES, SKILLS, labelOf } from "./labels";
import { buildLayout, type Section } from "./layout";

const NUMBER_FIELDS = new Set(["max_hp", "current_hp", "temp_hp", "PP", "GP", "EP", "SP", "CP"]);
const DERIVED = new Set(DERIVED_FIELDS);

interface Ctx {
  fields: Fields;
  schema: FormSchema;
  derived: Record<string, Derived>;
  setField(name: string, value: string): void;
  readOnly: boolean;
}
const SheetCtx = createContext<Ctx | null>(null);
const useCtx = () => useContext(SheetCtx)!;

/** 項目の種類に合った入力欄（派生値・readonly は表示のみ） */
function Control({ name, label }: { name: string; label?: string }) {
  const c = useCtx();
  const def = c.schema[name];
  if (!def) return null;
  const value = c.fields[name] ?? "";
  const lbl = label ?? labelOf(name);
  if (DERIVED.has(name) || def.readonly) return <DerivedValue label={lbl} derived={c.derived[name] ?? { value }} />;
  const p = { label: lbl, value, readOnly: c.readOnly, onChange: (v: string) => c.setField(name, v) };
  switch (def.kind) {
    case "textarea":
      return <EditableTextarea {...p} />;
    case "select":
      return <EditableSelect {...p} options={def.options ?? []} />;
    case "checkbox":
      return <EditableCheckbox {...p} checkedValue={def.checkedValue ?? "on"} />;
    default:
      return NUMBER_FIELDS.has(name) ? <EditableNumber {...p} /> : <EditableText {...p} />;
  }
}

/** ラベル付きの 1 項目 */
function Item({ name, label }: { name: string; label?: string }) {
  const { schema } = useCtx();
  const kind = schema[name]?.kind;
  const lbl = label ?? labelOf(name);
  if (kind === "checkbox")
    return (
      <label className="item check">
        <Control name={name} label={lbl} />
        <span className="lbl">{lbl}</span>
      </label>
    );
  const wide = kind === "textarea" || name === "memo" || name === "img_url";
  return (
    <div className={`item${wide ? " wide" : ""}`}>
      <span className="lbl">{lbl}</span>
      <Control name={name} label={lbl} />
    </div>
  );
}

function Items({ names, labels }: { names: string[]; labels?: Record<string, string> }) {
  if (!names.length) return null;
  return (
    <div className="items">
      {names.map((n) => (
        <Item key={n} name={n} label={labels?.[n]} />
      ))}
    </div>
  );
}

/** 行を「値のある行＋（編集できるときは）空の行 1 つ」に絞る */
function visibleRows<T>(rows: T[], isEmpty: (r: T) => boolean, readOnly: boolean): T[] {
  const firstEmpty = readOnly ? undefined : rows.find(isEmpty);
  return rows.filter((r) => !isEmpty(r) || r === firstEmpty);
}

function indices(fields: string[], re: RegExp): number[] {
  const set = new Set<number>();
  for (const f of fields) {
    const m = re.exec(f);
    if (m) set.add(Number(m[1]));
  }
  return [...set].sort((a, b) => a - b);
}

// ---- セクションごとの表示 ----
// 各関数は表示に使った項目名を handled に入れる。残りは最後に汎用の並びで出すので、項目が消えることはない。

type Body = (names: string[], handled: Set<string>) => ReactNode;

function useBodies(): Record<string, Body> {
  const { fields, readOnly } = useCtx();
  const val = (n: string) => fields[n] ?? "";

  return {
    abilities(names, handled) {
      const rows = ABILITIES.filter(([a]) => names.includes(a.toLowerCase()));
      return (
        <table className="grid abilities">
          <thead>
            <tr>
              <th />
              <th>基本</th>
              <th>種族</th>
              <th>成長</th>
              <th>能力値</th>
              <th>修正</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([a, ja]) => {
              const l = a.toLowerCase();
              const cols = [`${l}_base`, `${l}_race`, `${l}_gain`, l, `${l}_mod`];
              const heads = ["基本", "種族", "成長", "能力値", "修正"];
              cols.forEach((c) => handled.add(c));
              return (
                <tr key={a}>
                  <th scope="row">
                    {ja}
                    <small>{a}</small>
                  </th>
                  {cols.map((c, i) => (
                    <td key={c} className={i >= 3 ? "strong" : undefined}>
                      <Control name={c} label={`${ja} ${heads[i]}`} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    },

    saves(names, handled) {
      const rows = ABILITIES.filter(([a]) => names.includes(`${a}_ST`));
      return (
        <ul className="rows checks">
          {rows.map(([a, ja]) => {
            for (const s of ["ST", "MOD_ST", "PFOF_ST", "OTHER_ST", "PROF_ST_CHK"]) handled.add(`${a}_${s}`);
            return (
              <li key={a}>
                <Control name={`${a}_PROF_ST_CHK`} label={`${ja}セーヴ 習熟`} />
                <span className="name">{ja}</span>
                <span className="total">
                  <Control name={`${a}_ST`} label={`${ja}セーヴ`} />
                </span>
                <span className="other">
                  <small>その他</small>
                  <Control name={`${a}_OTHER_ST`} label={`${ja}セーヴ その他`} />
                </span>
              </li>
            );
          })}
        </ul>
      );
    },

    skills(names, handled) {
      const keys = names.filter((n) => n.startsWith("SKILL_")).map((n) => n.slice(6));
      if (names.includes("PASSIVEWISDOMPERCEPTION")) handled.add("PASSIVEWISDOMPERCEPTION").add("PASSIVEWISDOMPERCEPTION_OTHER");
      return (
        <ul className="rows checks">
          {keys.map((k) => {
            const [ja, ab] = SKILLS[k] ?? [k, ""];
            for (const p of ["SKILL", "S_ABILITY", "S_PROF", "S_PROF_MOD", "S_MOD"]) handled.add(`${p}_${k}`);
            return (
              <li key={k}>
                <Control name={`S_PROF_${k}`} label={`${ja} 習熟`} />
                <span className="name">
                  {ja} <small>{ab}</small>
                </span>
                <span className="total">
                  <Control name={`SKILL_${k}`} label={ja} />
                </span>
                <span className="other">
                  <small>その他</small>
                  <Control name={`S_MOD_${k}`} label={`${ja} その他`} />
                </span>
              </li>
            );
          })}
          {names.includes("PASSIVEWISDOMPERCEPTION") && (
            <li>
              <span />
              <span className="name">受動知覚</span>
              <span className="total">
                <Control name="PASSIVEWISDOMPERCEPTION" />
              </span>
              <span className="other">
                <small>その他</small>
                <Control name="PASSIVEWISDOMPERCEPTION_OTHER" />
              </span>
            </li>
          )}
        </ul>
      );
    },

    combat(names, handled) {
      const pick = (...ns: string[]) => {
        const out = ns.filter((n) => names.includes(n));
        out.forEach((n) => handled.add(n));
        return out;
      };
      const tiles = pick("ac", "initiative", "movement");
      const hp = pick("max_hp", "current_hp", "temp_hp", "hitdice");
      const ac = pick("ac_base", "ac_mod_ability", "ARMOR_MOD_LIMIT", "ac_mod_armor", "ac_mod_shield", "ac_mod_other");
      pick("initiative_dex_mod"); // イニシアチブの内訳に出る
      const init = pick("initiative_other_mod");
      const mv = pick("base_movement", "equip_movement", "item_movement", "other_movement", "special_movement");
      const suc = names.filter((n) => /^die_suc\d+$/.test(n));
      const fail = names.filter((n) => /^die_fail\d+$/.test(n));
      [...suc, ...fail].forEach((n) => handled.add(n));
      return (
        <>
          <div className="tiles">
            {tiles.map((n) => (
              <div key={n} className="tile">
                <span className="lbl">{labelOf(n)}</span>
                <Control name={n} />
              </div>
            ))}
          </div>
          <Items names={hp} />
          {suc.length + fail.length > 0 && (
            <div className="deathsaves">
              <span className="lbl">死亡セーヴ</span>
              <span>
                成功{" "}
                {suc.map((n, i) => (
                  <Control key={n} name={n} label={`死亡セーヴ 成功 ${i + 1}`} />
                ))}
              </span>
              <span>
                失敗{" "}
                {fail.map((n, i) => (
                  <Control key={n} name={n} label={`死亡セーヴ 失敗 ${i + 1}`} />
                ))}
              </span>
            </div>
          )}
          <h3>AC の内訳</h3>
          <Items names={ac} labels={{ ac_mod_other: "AC その他" }} />
          <h3>イニシアチブ・移動</h3>
          <Items names={[...init, ...mv]} labels={{ initiative_other_mod: "イニシアチブ その他", base_movement: "移動 基本", equip_movement: "移動 装備", item_movement: "移動 アイテム", other_movement: "移動 その他" }} />
        </>
      );
    },

    attacks(names, handled) {
      const idx = indices(names, /^attacks_(?:[a-z]+_)?(\d+)$/);
      const cols = (i: number) => [`attacks_${i}`, `attacks_bonus_${i}`, `attacks_damege_${i}`, `attacks_type_${i}`, `attacks_memo_${i}`];
      idx.forEach((i) => cols(i).forEach((c) => handled.add(c)));
      const rows = visibleRows(idx, (i) => cols(i).every((c) => val(c) === ""), readOnly);
      return (
        <>
          {rows.length > 0 && (
            <ul className="rows attacks">
              {rows.map((i) => (
                <li key={i}>
                  <span className="atk-name">
                    <Control name={`attacks_${i}`} label={`攻撃 ${i + 1} 名前`} />
                  </span>
                  <span>
                    <small>命中</small>
                    <Control name={`attacks_bonus_${i}`} label={`攻撃 ${i + 1} 命中`} />
                  </span>
                  <span>
                    <small>ダメージ</small>
                    <Control name={`attacks_damege_${i}`} label={`攻撃 ${i + 1} ダメージ`} />
                  </span>
                  <span>
                    <small>種別</small>
                    <Control name={`attacks_type_${i}`} label={`攻撃 ${i + 1} 種別`} />
                  </span>
                  <span className="atk-memo">
                    <small>メモ</small>
                    <Control name={`attacks_memo_${i}`} label={`攻撃 ${i + 1} メモ`} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      );
    },

    equipment(names, handled) {
      const coins = ["PP", "GP", "EP", "SP", "CP", "COINWEIGHT"].filter((n) => names.includes(n));
      coins.forEach((n) => handled.add(n));
      const idx = indices(names, /^EQUIPMENT(?:WEGIHT|NUM)?_(\d+)$/);
      const cols = (i: number) => [`EQUIPMENT_${i}`, `EQUIPMENTWEGIHT_${i}`, `EQUIPMENTNUM_${i}`];
      idx.forEach((i) => cols(i).forEach((c) => handled.add(c)));
      const rows = visibleRows(idx, (i) => cols(i).every((c) => val(c) === ""), readOnly);
      return (
        <>
          <Items names={coins} />
          {rows.length > 0 && (
            <table className="grid equipment">
              <thead>
                <tr>
                  <th>品名</th>
                  <th>重量</th>
                  <th>個数</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i}>
                    <td>
                      <Control name={`EQUIPMENT_${i}`} label={`所持品 ${i + 1} 品名`} />
                    </td>
                    <td>
                      <Control name={`EQUIPMENTWEGIHT_${i}`} label={`所持品 ${i + 1} 重量`} />
                    </td>
                    <td>
                      <Control name={`EQUIPMENTNUM_${i}`} label={`所持品 ${i + 1} 個数`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      );
    },

    spells(names, handled) {
      const head = ["SPELLCASTINGCLASS", "SPELLCASTINGABILITY", "SPELLSAVEDC", "SPELLATTACKBONUS"].filter((n) => names.includes(n));
      head.forEach((n) => handled.add(n));
      const levels = indices(names, /^SPELLLV(\d+)_/);
      return (
        <>
          <Items names={head} />
          {levels.map((lv) => {
            const spells = names
              .filter((n) => new RegExp(`^SPELLLV${lv}_(\\d+)$`).test(n))
              .map((n) => ({ name: n, prep: `${n}_PREPEARD` }));
            const slots = [`SPELLLV${lv}_SLOTTOTAL`, `SPELLLV${lv}_SLOTUSED`].filter((n) => names.includes(n));
            spells.forEach((s) => handled.add(s.name).add(s.prep));
            slots.forEach((n) => handled.add(n));
            const rows = visibleRows(spells, (s) => val(s.name) === "" && val(s.prep) === "", readOnly);
            if (readOnly && !rows.length && slots.every((n) => val(n) === "")) return null;
            const title = lv === 0 ? "初級呪文" : `Lv${lv}`;
            return (
              <div key={lv} className="spell-level">
                <h3>
                  {title}
                  {slots.length > 0 && (
                    <span className="slots">
                      <small>スロット</small>
                      <Control name={`SPELLLV${lv}_SLOTTOTAL`} label={`${title} スロット総数`} />
                      <small>使用</small>
                      <Control name={`SPELLLV${lv}_SLOTUSED`} label={`${title} スロット使用数`} />
                    </span>
                  )}
                </h3>
                <ul className="rows spells">
                  {rows.map((s, i) => (
                    <li key={s.name}>
                      {names.includes(s.prep) && <Control name={s.prep} label={`${title} 呪文 ${i + 1} 準備`} />}
                      <Control name={s.name} label={`${title} 呪文 ${i + 1}`} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </>
      );
    },
  };
}

function SectionCard({ section, body }: { section: Section; body?: Body }) {
  const handled = new Set<string>();
  const content = body?.(section.fields, handled);
  const rest = section.fields.filter((n) => !handled.has(n));
  return (
    <section className="card" id={`sec-${section.id}`} aria-labelledby={`h-${section.id}`}>
      <h2 id={`h-${section.id}`}>{section.title}</h2>
      {content}
      <Items names={rest} />
    </section>
  );
}

export function SheetView(props: Ctx) {
  const { schema } = props;
  const sections = useMemo(() => buildLayout(schema), [schema]);
  return (
    <SheetCtx.Provider value={props}>
      <SheetBody sections={sections} />
    </SheetCtx.Provider>
  );
}

function SheetBody({ sections }: { sections: Section[] }) {
  const bodies = useBodies();
  return (
    <>
      <nav className="toc" aria-label="セクション">
        {sections.map((s) => (
          <a key={s.id} href={`#sec-${s.id}`}>
            {s.title}
          </a>
        ))}
      </nav>
      {sections.map((s) => (
        <SectionCard key={s.id} section={s} body={bodies[s.id]} />
      ))}
    </>
  );
}
