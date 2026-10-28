# dnd-kanata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 元サイト（dndjp.sakura.ne.jp）の D&D 5版キャラクターを取り込み、1画面で表示とその場編集（自動保存）ができ、必要なときだけ手動で書き戻せる Web アプリを作る。

**Architecture:** pnpm workspaces のモノレポ。`packages/core` は派生値計算・フォーム解析・キーのエスケープを持つ純粋な TypeScript で、`web`（React）と `functions`（Cloud Functions）の両方から使う。データは Firebase Realtime Database に置き、元サイトへのアクセスは Cloud Functions の `importSheet` / `writeBack` だけが行う。

**Tech Stack:** Node.js 24（mise）、TypeScript、Vitest、jsdom、node-html-parser、iconv-lite、React 18 + Vite + react-router、Firebase（Auth / Realtime Database / Functions v2 / Hosting）、firebase-tools（ルートの devDependency、`pnpm exec firebase`）、pnpm 12.15.0（mise）、Java 21（Emulator 用、mise）。

**Spec:** `docs/superpowers/specs/2026-10-28-dnd-kanata-design.md`

## Global Constraints

- パッケージマネージャは pnpm（mise で 12.15.0）。npm / npx は使わない。ワークスペースは `pnpm-workspace.yaml` で定義し、`package-lock.json` は置かない。
- 元サイトへのアクセスは `https://dndjp.sakura.ne.jp/INPUT_FORM.php?ID={数字}` の GET と `https://dndjp.sakura.ne.jp/OUTPUT.php?ID={数字}` の POST のみ。他の URL は組み立てない。
- 元サイトの文字コードは CP932（Shift_JIS）。デコード・エンコードは `iconv-lite` の `"cp932"` を使う。
- User-Agent: `dnd-kanata (+https://github.com/oldgeese/dnd-kanata)`。
- 取り込みと書き戻しは合わせて 1 ユーザーあたり 1 分に 5 回まで。シート画面での編集は対象外。
- 元サイトのパスワードはどこにも保存せず、ログにも出さない。
- 項目名は元サイトのものをそのまま使う。Realtime Database のキーにするときだけ `encodeKey` を通す。
- 項目の値はすべて文字列。チェックボックスはチェック時に `checkedValue`（元フォームの `value` 属性、無ければ `"on"`）、未チェック時に `""`。
- 自動保存は入力停止から 500ms 後に、変更した項目だけを `update` する。
- Functions のリージョンは `asia-northeast1`。
- 元サイトの HTML と `dddb5e.js` はリポジトリにコミットしない（`.gitignore` 済みの `fixtures/` に取得スクリプトで保存する）。

## Review Focus

1. **数値でない入力**（`""`、`"+2"`、`"abc"`、`" 3"`）: 元の `intval`/`parseInt` と同じ解釈で計算されること → Task 2 の差分テストの変異ケースに含める。
2. **取り込み後に元サイト側で編集されていた場合の書き戻し**: 黙って上書きせず、`last_update` の不一致を返して確認を求めること → Task 5 のテスト。
3. **CP932 で表せない文字**（絵文字など）を含む項目の書き戻し: `?` に化けさせて送らず、項目名を返して中止すること → Task 5 のテスト。
4. **存在しない ID の取り込み**: 元サイトは新規作成フォーム（hidden `ID` が空）を 200 で返す。シートを作らず `not-found` を返すこと → Task 3 のテスト。
5. **共有されていない／存在しないシートの閲覧用 URL**: エラー画面ではなく「見つかりません」を表示すること（ルールで読み取りが拒否される） → Task 4 のルールテストと Task 8 の画面。

---

## ファイル構成

```
package.json                    workspaces: packages/core, functions, web
mise.toml                       node 24.22.1, java temurin-21
firebase.json / .firebaserc     hosting(web/dist), functions(functions), database(database.rules.json), emulators
database.rules.json
scripts/fetch-fixtures.sh       元サイトの HTML と JS を fixtures/ に取得
fixtures/                       (gitignore) input_form_54555.html (CP932 のまま), dddb5e.js
packages/core/src/
  types.ts                      Fields, FieldDef, FormSchema, Derived, Sheet
  keys.ts                       encodeKey / decodeKey / encodeRecord / decodeRecord
  parse.ts                      parseInputForm
  derive.ts                     computeDerived, DERIVED_FIELDS
  index.ts
packages/core/test/             keys.test.ts, parse.test.ts, derive.test.ts, derive.diff.test.ts, loadFixture.ts
functions/src/
  source.ts                     fetchInputForm, postOutput（元サイト I/O）
  rateLimit.ts                  checkRateLimit
  importSheet.ts                importSheet (onCall)
  writeBack.ts                  buildWriteBackBody, classifyWriteBackResponse, writeBack (onCall)
  index.ts
functions/test/                 importSheet.test.ts, writeBack.test.ts, rules.test.ts
web/src/
  firebase.ts                   初期化と Emulator 接続
  auth.tsx                      useAuth, <RequireAuth>
  pages/ListPage.tsx            一覧と取り込み
  pages/SheetPage.tsx           /c/:id と /s/:id 共通（readOnly prop）
  sheet/layout.ts               セクション定義
  sheet/fields/*.tsx            EditableText, EditableNumber, EditableTextarea, EditableCheckbox, EditableSelect, DerivedValue
  sheet/useSheet.ts             購読・派生値・自動保存
  sheet/SaveStatus.tsx
  sheet/WriteBackDialog.tsx
  sheet/ShareToggle.tsx
```

---

### Task 1: リポジトリの土台と core の型・キーエスケープ

**Files:**
- Create: `package.json`, `mise.toml`, `.gitignore`, `tsconfig.base.json`, `scripts/fetch-fixtures.sh`, `packages/core/{package.json,tsconfig.json,vitest.config.ts}`, `packages/core/src/{types.ts,keys.ts,index.ts}`
- Test: `packages/core/test/keys.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Fields = Record<string, string>;
  export type FieldKind = "text" | "textarea" | "select" | "checkbox" | "hidden";
  export interface FieldDef {
    kind: FieldKind; order: number; readonly?: true;
    options?: { value: string; label: string }[];   // select のみ
    checkedValue?: string;                           // checkbox のみ
  }
  export type FormSchema = Record<string, FieldDef>;
  export interface Derived { value: string; parts?: { label: string; value: string }[] }
  export interface Sheet {               // DB 上の形（キーは encodeKey 済み）
    ownerUid: string; sourceId: number; shared: boolean;
    fields: Fields; schema: FormSchema; sourceLastUpdate: string;
    importedAt: number; updatedAt: number;
  }
  export function encodeKey(name: string): string;
  export function decodeKey(key: string): string;
  export function encodeRecord<T>(r: Record<string, T>): Record<string, T>;
  export function decodeRecord<T>(r: Record<string, T>): Record<string, T>;
  ```
- `@dnd-kanata/core` としてワークスペースから参照する。

- [ ] **Step 1:** `mise.toml`（`node = "24.22.1"`, `java = "temurin-21"`）、ルート `package.json`（`"workspaces": ["packages/core","functions","web"]`, scripts: `test`, `fixtures`）、`.gitignore`（`node_modules`, `dist`, `lib`, `fixtures/`, `.firebase/`, `*-debug.log`）を作る。
- [ ] **Step 2:** `scripts/fetch-fixtures.sh` を作る。`fixtures/input_form_54555.html`（`INPUT_FORM.php?ID=54555`、CP932 のまま保存）と `fixtures/dddb5e.js`（CP932 のまま）を、Global Constraints の User-Agent で curl する。`npm run fixtures` で実行し、2 ファイルができることを確認する。
- [ ] **Step 3: 失敗するテストを書く** — `keys.test.ts`
  ```ts
  test("禁止文字を可逆にエスケープする", () => {
    for (const n of ["a.b", "a$b", "a#b", "a[0]", "a/b", "a%b", "str_mod", "SPELLLV1_2_PREPEARD"]) {
      expect(encodeKey(n)).not.toMatch(/[.$#\[\]\/]/);
      expect(decodeKey(encodeKey(n))).toBe(n);
    }
    expect(encodeKey("str_mod")).toBe("str_mod");
  });
  ```
- [ ] **Step 4:** `npm test -w packages/core` で FAIL を確認する。
- [ ] **Step 5:** `keys.ts` を実装する。`%` と `. $ # [ ] /` を `%XX`（大文字 16 進）に置き換える。
- [ ] **Step 6:** テストが PASS することを確認する。
- [ ] **Step 7:** Commit `chore: scaffold monorepo and core key encoding`

### Task 2: 派生値の計算（`computeDerived`）と元 JS との差分テスト

**Files:**
- Create: `packages/core/src/parse.ts`, `packages/core/src/derive.ts`, `packages/core/test/loadFixture.ts`
- Test: `packages/core/test/parse.test.ts`, `packages/core/test/derive.test.ts`, `packages/core/test/derive.diff.test.ts`

**Interfaces:**
- Consumes: Task 1 の型。
- Produces:
  ```ts
  export function parseInputForm(html: string): { fields: Fields; schema: FormSchema; id: string; lastUpdate: string };
  export const DERIVED_FIELDS: readonly string[];
  export function computeDerived(fields: Fields): Record<string, Derived>;
  ```

`parseInputForm` の仕様（デコード済み文字列を受け取る）:
- `form[name=F]` 内の `input` / `textarea` / `select` で `name` を持つものを対象にする。`type=button`・`type=password`・`name` が `ID`・`UPDATE` のものは `fields`/`schema` に入れない。`ID` の値は戻り値の `id`、`last_update` の値は `lastUpdate` にも入れる（`last_update` は fields にも残す）。
- `order` は文書内の出現順（0 始まり）。`readonly` 属性があれば `readonly: true`。
- select の値は `selected` の option、無ければ先頭の option。`textarea` は中身のテキスト（HTML エンティティをデコード）。

`computeDerived` の仕様（`dddb5e.js` の `calc_all()` → `CGP()` → `divideChange()` を順に実行したのと同じ結果）:
- `intval(v)` = `parseInt(v)`、NaN なら 0。`floatval` も同様。`mod(v)` = `v === "" ? "" : Math.ceil((v - 11) / 2)`。チェック判定は値が `""` でないこと。
- 出力する項目（= `DERIVED_FIELDS`）: `str_mod` … `cha_mod`、`initiative_dex_mod`、`initiative`、`ac_mod_ability`、`ac`、`profeciency_bonus`、`{STR..CHA}_MOD_ST`、`{STR..CHA}_PFOF_ST`、`{STR..CHA}_ST`、18 技能それぞれの `S_ABILITY_*`・`S_PROF_MOD_*`・`SKILL_*`、`PASSIVEWISDOMPERCEPTION`、`movement`、`COINWEIGHT`、`COINANDEQUIPMENTWEIGHT`、`ability_points`。
- 技能と能力値の対応は `dddb5e.js` の `CSKILL()` のとおり（綴りも元のまま: `SLEGHTOFHAND`, `profeciency_bonus`, `EQUIPMENTWEGIHT_`）。
- 習熟ボーナスがレベル 1〜20 の範囲外のときは、入力の `profeciency_bonus` をそのまま返す（元 JS が値を書き換えないため）。
- `movement` は `"{合計}ft./{intval(合計/5)}sq."`。
- `parts` は `ac`、`initiative`、`*_ST`、`SKILL_*`、`PASSIVEWISDOMPERCEPTION` に付ける（例: `SKILL_STEALTH` → `[{label:"DEX",value:"4"},{label:"習熟",value:"4"},{label:"その他",value:"0"}]`）。
- 数値の文字列化は JS の `String(number)` と同じにする（`dddb5e.js` がフォームに数値を代入したときと一致させる）。

- [ ] **Step 1: 失敗するテストを書く** — `parse.test.ts`（`loadFixture()` は `fixtures/input_form_54555.html` を cp932 でデコードして返す。ファイルが無ければ「`npm run fixtures` を実行してください」というエラーを投げる）
  ```ts
  const r = parseInputForm(loadFixture());
  expect(r.id).toBe("54555");
  expect(r.fields.str).toBe("11");
  expect(r.fields.str_base).toBe("9");
  expect(r.fields.char_level).toBe("10");
  expect(r.fields.ARMOR_MOD_LIMIT).toBe("MAX2");
  expect(r.schema.DEX_PROF_ST_CHK).toMatchObject({ kind: "checkbox", checkedValue: "on" });
  expect(r.fields.DEX_PROF_ST_CHK).toBe("on");
  expect(r.fields.STR_PROF_ST_CHK).toBe("");
  expect(r.schema.no_list.checkedValue).toBe("true");
  expect(r.schema.alignment.options).toHaveLength(9);
  expect(r.schema.str_mod.readonly).toBe(true);
  expect(r.fields).not.toHaveProperty("password");
  expect(r.fields).not.toHaveProperty("ID");
  expect(r.fields).not.toHaveProperty("UPDATE");
  expect(Object.keys(r.schema)).toHaveLength(582);   // 名前付き 586 項目から password, OK, ID, UPDATE を除く。実測値と違えば実測値を確認したうえで更新
  ```
- [ ] **Step 2:** FAIL を確認する。
- [ ] **Step 3:** `parse.ts` を `node-html-parser` で実装する。
- [ ] **Step 4:** PASS を確認する。
- [ ] **Step 5: 失敗するテストを書く** — `derive.test.ts`（元 JS に依存しない、読みやすい確認用ケース）
  ```ts
  const base = { str: "11", dex: "18", con: "10", int: "", wis: "12", cha: "10", char_level: "10", ARMOR_MOD_LIMIT: "MAX2", ac_base: "10", S_PROF_STEALTH: "on", PP: "1", GP: "100", EP: "", SP: "", CP: "" };
  const d = computeDerived(base);
  expect(d.dex_mod.value).toBe("4");
  expect(d.int_mod.value).toBe("0");
  expect(d.INT_MOD_ST.value).toBe("");
  expect(d.profeciency_bonus.value).toBe("4");
  expect(d.ac_mod_ability.value).toBe("2");
  expect(d.SKILL_STEALTH.value).toBe("8");
  expect(d.SKILL_STEALTH.parts).toEqual([{label:"DEX",value:"4"},{label:"習熟",value:"4"},{label:"その他",value:"0"}]);
  expect(d.COINWEIGHT.value).toBe("2.02");
  expect(computeDerived({ ...base, char_level: "" }).profeciency_bonus.value).toBe("");
  ```
- [ ] **Step 6: 失敗するテストを書く** — `derive.diff.test.ts`。jsdom で fixture の HTML（デコード済み）を読み、`window.alert`/`window.confirm` をスタブ（`confirm` は `true`）し、`dddb5e.js` を `window.eval` で読み込む。各ケースでフォームの値を書き換え → `calc_all(); CGP(); divideChange();` を呼ぶ → `DERIVED_FIELDS` の各項目について `form.elements[name].value` と `computeDerived(現在のフォーム値).value` を比較する。フォーム値の取り出しは、jsdom の要素から `parseInputForm` と同じ規則（チェックボックスは `checked ? checkedValue : ""`）で行う `readFormFields(form)` をテスト内に書く。
  ケース（`test.each`）:
  - 変更なし
  - `dex` を `"1"`〜`"30"` と `""`、`"abc"`、`"+2"`、`" 3"` に変える
  - `char_level` を `"1"`〜`"20"` に変える
  - `ARMOR_MOD_LIMIT` を `"NA"`、`"MAX2"`、`"ZERO"`、`""` に変える
  - 6 つのセーヴ習熟チェックと 18 技能の習熟チェックをそれぞれ反転する
  - `PP`/`GP`/`EP`/`SP`/`CP` に `"0"`、`"7"`、`"12345"`、`"1.5"`、`""` を入れる
  - `EQUIPMENTWEGIHT_0` = `"0.1"`、`EQUIPMENTNUM_0` = `"3"`（浮動小数の丸め）
  - `str_base` を `"7"`（範囲外 → `ability_points` が NaN 系の値）
  - `initiative_other_mod`、`STR_OTHER_ST`、`S_MOD_PERCEPTION`、`PASSIVEWISDOMPERCEPTION_OTHER`、`base_movement`〜`other_movement` に `"2"`、`"-1"`、`"x"`
- [ ] **Step 7:** 両テストの FAIL を確認する。
- [ ] **Step 8:** `derive.ts` を実装する。`dddb5e.js` の該当関数を読み、計算順と型変換を保ったまま純粋関数に移植する。
- [ ] **Step 9:** `npm test -w packages/core` が全件 PASS することを確認する。不一致があれば、元 JS 側の挙動に合わせる。
- [ ] **Step 10:** Commit `feat(core): parse source form and compute derived values`

### Task 3: Firebase の土台と `importSheet`

**Files:**
- Create: `firebase.json`, `.firebaserc`, `functions/{package.json,tsconfig.json,build.mjs}`, `functions/src/{source.ts,rateLimit.ts,importSheet.ts,index.ts}`
- Test: `functions/test/importSheet.test.ts`

**Interfaces:**
- Consumes: `parseInputForm`, `encodeRecord`, 型（Task 1, 2）。
- Produces:
  ```ts
  // source.ts
  export function parseSourceId(input: string): number | null;   // "54555" / "https://dndjp.sakura.ne.jp/OUTPUT.php?ID=54555" / INPUT_FORM の URL → 54555。それ以外 null
  export function fetchInputForm(id: number): Promise<string>;     // cp932 デコード済み HTML。非 200 は SourceError("unavailable")
  export function postOutput(id: number, body: Buffer): Promise<string>;  // Task 5 で使う。cp932 デコード済みの応答
  export class SourceError extends Error { code: "unavailable" | "not-found" | "unexpected-form" }
  // rateLimit.ts
  export function checkRateLimit(uid: string, now?: number): Promise<void>; // /rateLimits/{uid} を transaction で更新。直近 60 秒に 5 件あれば HttpsError("resource-exhausted")
  // importSheet (onCall)
  //   req: { source: string; overwrite?: boolean }
  //   res: { status: "created" | "overwritten"; sheetId: string } | { status: "exists"; sheetId: string }
  //   errors: invalid-argument（ID 不正）, not-found, unavailable, resource-exhausted, unauthenticated
  ```
- DB に追加するパス: `/rateLimits/{uid}`: `{ [pushKey]: timestamp }`（Functions 専用）、`/users/{uid}/sources/{sourceId}`: `sheetId`（同じ sourceId の重複検出用、Functions 専用）。

- [ ] **Step 1:** `firebase.json`（hosting: `web/dist`、SPA rewrite、functions: `functions`、`predeploy` で build、database: `database.rules.json`、emulators: auth 9099 / database 9000 / functions 5001 / hosting 5000）を作る。`.firebaserc` の default は `dnd-kanata`。Emulator でのテストは `--project demo-dnd-kanata` を付けて実行する（本番プロジェクトの課金は申請中のため、タスク 3〜8 は Emulator のみで進める）。
- [ ] **Step 2:** `functions/build.mjs` で esbuild により `src/index.ts` を `lib/index.js` に 1 ファイルでバンドルする（`@dnd-kanata/core` を取り込み、`firebase-admin`・`firebase-functions` は external）。`functions/package.json` の `dependencies` には external のものだけを書く（デプロイ時にワークスペース参照を解決できないため）。
- [ ] **Step 3: 失敗するテストを書く** — `importSheet.test.ts`（Database / Auth Emulator を使用。`fetch` は `vi.stubGlobal` で差し替え、fixture の CP932 バイト列を返す）
  - `parseSourceId`: `"54555"`、OUTPUT/INPUT_FORM の URL → `54555`。`"abc"`、`"https://evil.example/?ID=1"`、`"-1"`、`""` → `null`。
  - 正常系: `status: "created"`。`/sheets/{sheetId}` に `ownerUid`、`sourceId: 54555`、`shared: false`、`fields.str === "11"`、`schema`、`sourceLastUpdate` が入り、`/users/{uid}/sheets/{sheetId} === true`。`sheetId` は UUID v4 形式。
  - 同じ sourceId で再取り込み、`overwrite` なし → `status: "exists"` で DB は変化なし。`overwrite: true` → `"overwritten"`、`sheetId` は同じで `fields` が置き換わる（事前に書き込んだ `fields.current_hp = "1"` が fixture の値に戻る）。
  - 存在しない ID: hidden `ID` が空の HTML を返す → `not-found`、`/sheets` に何も作られない。
  - 元サイトが 500 → `unavailable`。
  - 6 回目の呼び出し（60 秒以内）→ `resource-exhausted`。
  - 未ログイン → `unauthenticated`。
  - `fetch` に渡された URL が `https://dndjp.sakura.ne.jp/INPUT_FORM.php?ID=54555` で、User-Agent が Global Constraints の値であること。
- [ ] **Step 4:** `pnpm exec firebase emulators:exec --project demo-dnd-kanata --only auth,database "pnpm --filter functions test"` で FAIL を確認する。
- [ ] **Step 5:** `source.ts`、`rateLimit.ts`、`importSheet.ts` を実装する（`onCall({ region: "asia-northeast1" })`）。`parseInputForm` の結果の `id` が要求 ID と一致しなければ `not-found`、`schema` に `str` が無ければ `unexpected-form`。保存は `/sheets/{id}`、`/users/{uid}/sheets/{id}`、`/users/{uid}/sources/{sourceId}` を 1 回の multi-path update で行う。
- [ ] **Step 6:** PASS を確認する。
- [ ] **Step 7:** Commit `feat(functions): import sheet from source site`

### Task 4: Realtime Database のセキュリティルール

**Files:**
- Create: `database.rules.json`
- Test: `functions/test/rules.test.ts`（`@firebase/rules-unit-testing`）

**Interfaces:**
- Consumes: Task 3 の DB パス。
- Produces: クライアントから許される操作は次の 3 つだけ。
  - 持ち主による `/sheets/{id}/fields/{key}` の書き込み（文字列、10,000 文字以下）と `/sheets/{id}/updatedAt` の書き込み（`now` 以下の数値）
  - 持ち主による `/sheets/{id}/shared` の書き込み（boolean）
  - 持ち主による `/sheets/{id}` と本人による `/users/{uid}/sheets` の読み取り、`shared === true` のシートの誰でもの読み取り

- [ ] **Step 1: 失敗するテストを書く** — 次をそれぞれ assertSucceeds / assertFails で書く。
  - 持ち主: シートの読み取り、`fields/str` の更新、`shared` の更新、`updatedAt` の更新 → 成功
  - 持ち主: `ownerUid`、`sourceId`、`schema`、`sourceLastUpdate` の書き換え、シートの新規作成・削除、`fields/str` に数値を書き込む → 失敗
  - 他人（ログイン済み）: `shared: false` のシートの読み取り → 失敗、`shared: true` → 成功、`fields` の書き込み → 常に失敗
  - 未ログイン: `shared: true` の読み取り → 成功、`shared: false` → 失敗
  - `/sheets` の一覧読み取り → 誰でも失敗
  - `/users/{他人}` の読み取り、`/users/{自分}` への書き込み、`/rateLimits` の読み書き → 失敗
  - 存在しない `/sheets/{id}` の読み取り（未ログイン）→ 失敗（画面は「見つかりません」を出す。Task 8 参照）
- [ ] **Step 2:** FAIL を確認する。
- [ ] **Step 3:** `database.rules.json` を書く。
- [ ] **Step 4:** PASS を確認する。
- [ ] **Step 5:** Commit `feat: database security rules`

### Task 5: 書き戻しの本文組み立てと `writeBack`

**Files:**
- Create: `functions/src/writeBack.ts`
- Modify: `functions/src/index.ts`
- Test: `functions/test/writeBack.test.ts`

**Interfaces:**
- Consumes: `computeDerived`, `parseInputForm`, `decodeRecord`, `fetchInputForm`, `postOutput`, `checkRateLimit`。
- Produces:
  ```ts
  export function buildWriteBackBody(args: { id: number; fields: Fields; schema: FormSchema; password: string; lastUpdate: string }):
    { ok: true; body: Buffer } | { ok: false; unencodable: string[] };
  export type WriteBackOutcome = "ok" | "bad-password" | "unknown";
  export function classifyWriteBackResponse(html: string): WriteBackOutcome;
  // writeBack (onCall)
  //   req: { sheetId: string; password: string; force?: boolean }
  //   res: { status: "ok" } | { status: "source-changed"; sourceLastUpdate: string; currentLastUpdate: string }
  //        | { status: "unencodable"; fields: string[] } | { status: "schema-changed"; added: string[] } | { status: "bad-password" }
  //   errors: permission-denied（持ち主以外）, not-found, unavailable, resource-exhausted, unauthenticated, internal（"unknown"）
  ```

`buildWriteBackBody` の仕様:
- `fields` に `computeDerived(fields)` の値を上書きで重ね、`schema` の `order` 順に並べる。チェックボックスは値が `""` なら送らない（ブラウザの送信と同じ）。最後に `ID`、`UPDATE=TRUE`、`password` を加える。`last_update` は引数の `lastUpdate` にする。
- 各値を CP932 にエンコードし、`application/x-www-form-urlencoded` の形でバイト列をパーセントエンコードする（スペースは `+`）。
- 値を cp932 でエンコード → デコードして元に戻らない項目があれば、その項目名の一覧を返す。

`writeBack` の処理順: 認証 → レート制限 → シート読み取り（持ち主確認）→ `fetchInputForm` → `schema` に無い項目があれば `schema-changed` → `lastUpdate` が `sourceLastUpdate` と異なり `force` でなければ `source-changed` → `buildWriteBackBody`（失敗なら `unencodable`）→ `postOutput` → 判定。`ok` のときは `sourceLastUpdate` を書き戻し後に `fetchInputForm` で取り直した値に更新する。

- [ ] **Step 1: 失敗するテストを書く** — `buildWriteBackBody`
  - fixture を `parseInputForm` した結果から本文を作り、デコードした結果（`URLSearchParams` を自前で cp932 デコード）で: `ID=54555`、`UPDATE=TRUE`、`password=pw`、`str_mod` が `computeDerived` の値、`STR_PROF_ST_CHK` が含まれない、`DEX_PROF_ST_CHK=on`、日本語の値（`char_name` など）が元と一致する。
  - `"〜①髙"` を含む値は往復できる（`ok: true`）。`"😀"` を含む `memo` → `{ ok: false, unencodable: ["memo"] }`。
  - `password` がログに出ないこと: `console.*` をスパイし、テスト中のどの出力にも `"pw-secret"` が含まれない。
- [ ] **Step 2:** FAIL を確認する。
- [ ] **Step 3:** `buildWriteBackBody` を実装する。
- [ ] **Step 4:** PASS を確認する。
- [ ] **Step 5: 元サイトの応答を確かめる（手動、利用者と一緒に行う）** — 利用者のテスト用キャラクター（利用者が指定した ID。54555 を使うかどうかも利用者に確認する）に対して、(a) 正しいパスワード、(b) 誤ったパスワードで、元サイトのフォームから通常どおり保存したときの応答 HTML を利用者に保存してもらう（ブラウザの「名前を付けて保存」）。両方を `fixtures/writeback_ok.html` と `fixtures/writeback_bad_password.html` に置き、2 つを見分けられる確実な目印（文言や要素）を決める。目印をこの計画の Step 6 のテストに書き込んでから進む。
- [ ] **Step 6: 失敗するテストを書く** — `classifyWriteBackResponse`: ok の fixture → `"ok"`、bad-password の fixture → `"bad-password"`、`"<html></html>"` → `"unknown"`。`writeBack`（Emulator、`fetch` をスタブ）: 持ち主以外 → `permission-denied`、`lastUpdate` 不一致 → `source-changed`（POST していない）、同じく `force: true` → POST する、未知の項目が増えた → `schema-changed`、絵文字を含む → `unencodable`（POST していない）、bad-password の応答 → `bad-password`、正常 → `ok` で `sourceLastUpdate` が更新される。
- [ ] **Step 7:** FAIL を確認する。
- [ ] **Step 8:** `classifyWriteBackResponse` と `writeBack` を実装する。
- [ ] **Step 9:** PASS を確認する。
- [ ] **Step 10:** Commit `feat(functions): write back sheet to source site`

### Task 6: Web の土台、ログイン、一覧と取り込み

**Files:**
- Create: `web/{package.json,vite.config.ts,tsconfig.json,index.html}`, `web/src/{main.tsx,App.tsx,firebase.ts,auth.tsx}`, `web/src/pages/ListPage.tsx`
- Test: `web/src/pages/ListPage.test.tsx`（Vitest + Testing Library、Firebase 呼び出しはモジュールごとモック）

**Interfaces:**
- Consumes: `importSheet` の req/res（Task 3）。
- Produces:
  ```ts
  // firebase.ts
  export const auth: Auth; export const db: Database; export const functions: Functions; // import.meta.env.VITE_USE_EMULATORS === "true" なら Emulator に接続
  // auth.tsx
  export function useAuth(): { user: User | null; loading: boolean; signIn(): Promise<void>; signOut(): Promise<void> };
  export function RequireAuth(props: { children: ReactNode }): JSX.Element;
  ```
- ルート: `/`（ListPage, RequireAuth）、`/c/:sheetId`（SheetPage readOnly=false, RequireAuth）、`/s/:sheetId`（SheetPage readOnly=true）。

- [ ] **Step 1: 失敗するテストを書く** — ListPage
  - `/users/{uid}/sheets` の各シートの `fields.char_name`、`fields.char_class`、`fields.char_level` を一覧表示し、`/c/{sheetId}` へリンクする。
  - 取り込み欄に URL を入れて送信 → `importSheet({ source })` を呼び、`created` なら `/c/{sheetId}` に遷移する。
  - `exists` が返る → 「取り込み済みです。元サイトの内容で上書きしますか？（この画面での編集内容は失われます）」の確認を出し、OK なら `overwrite: true` で再度呼ぶ。
  - エラーの表示文言: `invalid-argument` →「元サイトの URL か数字の ID を入力してください」、`not-found` →「元サイトにそのキャラクターが見つかりません」、`unavailable` →「元サイトに接続できませんでした。時間をおいて再度お試しください」、`resource-exhausted` →「操作が多すぎます。1 分ほど待ってから再度お試しください」。
- [ ] **Step 2:** FAIL を確認する。
- [ ] **Step 3:** 実装する（確認は `window.confirm` ではなく画面内のダイアログで出す）。
- [ ] **Step 4:** PASS を確認する。Emulator（`pnpm exec firebase emulators:start --project demo-dnd-kanata` と `pnpm --filter web dev`、`VITE_USE_EMULATORS=true`）で、ログイン → 54555 の取り込み → 一覧表示を手動で確認する。
- [ ] **Step 5:** Commit `feat(web): sign-in, sheet list and import`

### Task 7: シート画面のその場編集と自動保存

**Files:**
- Create: `web/src/pages/SheetPage.tsx`, `web/src/sheet/{layout.ts,useSheet.ts,SaveStatus.tsx}`, `web/src/sheet/fields/{EditableText,EditableNumber,EditableTextarea,EditableCheckbox,EditableSelect,DerivedValue}.tsx`
- Test: `web/src/sheet/useSheet.test.ts`, `web/src/sheet/fields/fields.test.tsx`, `web/src/sheet/layout.test.ts`

**Interfaces:**
- Consumes: `computeDerived`, `DERIVED_FIELDS`, `decodeRecord`, `encodeKey`, `Sheet`, `FormSchema`。
- Produces:
  ```ts
  export type SaveState = "saved" | "saving" | "offline" | "error";
  export function useSheet(sheetId: string): {
    status: "loading" | "not-found" | "ready";
    sheet: Sheet | null;            // fields/schema は decode 済み
    derived: Record<string, Derived>;
    setField(name: string, value: string): void;   // 即座に画面へ反映し、500ms デバウンスで update
    saveState: SaveState; retry(): void;
  };
  export interface Section { id: string; title: string; fields: string[] }
  export function buildLayout(schema: FormSchema): Section[];
  ```

- `layout.ts` のセクション（元サイトと同じ順）: 基本情報（`char_name` 〜 `memo`, `img_url`, `tag`, `no_list`）、能力値（`*_base`/`*_race`/`*_gain`/能力値/修正値/`ability_points`/`inspiration`/`profeciency_bonus`）、セーヴ（`*_ST` 系）、技能（18 技能、`PASSIVEWISDOMPERCEPTION*`）、戦闘（`ac*`, `ARMOR_MOD_LIMIT`, `initiative*`, `*movement`, `max_hp`, `current_hp`, `temp_hp`, `hitdice`, `die_suc*`, `die_fail*`）、攻撃（`attacks_*`, `ATTACKSANDSPELLCASTING_TEXT`）、人物像（`background`, `PERSONALITYTRAITS`, `IDEALS`, `BONDS`, `FLAWS`, `SETTING`）、所持品（`PP`〜`CP`, `COINWEIGHT`, `EQUIPMENT*`, `COINANDEQUIPMENTWEIGHT`）、特徴・特技（`OTHERPROFICIENCIESANDLANGUAGES`, `FEATURESANDTRAITS`）、呪文（`SPELLCASTING*`, `SPELLSAVEDC`, `SPELLATTACKBONUS`, `SPELLLV*`）。番号付きの項目は `schema` から正規表現で集め、`order` 順に並べる。
- 入力欄の種類: `schema.kind` で決める。`text` のうち `max_hp`, `current_hp`, `temp_hp`, `PP`, `GP`, `EP`, `SP`, `CP` は EditableNumber（± ボタン付き、1 ずつ増減）。`DERIVED_FIELDS` と `readonly` の項目は DerivedValue（`parts` があれば title/ツールチップで内訳を表示）。
- 表示モード: 値が `""` の項目は薄い「—」を表示し、クリック／タップ／Enter で編集モードに入る。確定は blur か Enter（textarea は blur のみ）、Esc で取り消し。

- [ ] **Step 1: 失敗するテストを書く**
  - `layout.test.ts`: fixture の schema（Task 2 の `parseInputForm` 結果を JSON にした `web/src/sheet/__fixtures__/schema.json`。テスト前に生成スクリプトで作り、gitignore する）で、`schema` のすべての項目（`hidden` を除く）がちょうど 1 つのセクションに入る。
  - `useSheet.test.ts`（偽タイマー、`update` をモック）: `setField("dex","20")` 直後に `derived.dex_mod.value === "5"`、`update` は未呼び出し。500ms 後に `update` が `{ "fields/dex": "20", updatedAt: <serverTimestamp> }` の 1 回だけで呼ばれる。300ms 間隔で 3 回変更すると、最後の変更から 500ms 後に 1 回だけ呼ばれる。`update` が reject → `saveState === "error"`、`retry()` で同じ内容を再送する。`.info/connected` が false → `"offline"`。シートが読めない（permission denied か null）→ `status === "not-found"`。
  - `fields.test.tsx`: EditableText のクリック → input 表示 → Enter で `onChange` が呼ばれる。Esc で呼ばれない。EditableNumber の「+」で `"7"` → `"8"`、値が `""` のとき「+」で `"1"`。EditableCheckbox のクリックで `checkedValue` と `""` が入れ替わる。readOnly のときはどれも編集モードに入らない。
- [ ] **Step 2:** FAIL を確認する。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** PASS を確認する。Emulator で 54555 を開き、DEX を変えると修正値・技能・AC・イニシアチブが即座に変わること、リロード後も値が残っていること、DevTools でオフラインにすると「オフライン」表示になり、戻すと「保存済み」になることを手動で確認する。スマホ幅（375px）でも項目をタップして編集できることを確認する。
- [ ] **Step 5:** Commit `feat(web): inline-editable sheet with autosave`

### Task 8: 閲覧用リンクと書き戻しダイアログ

**Files:**
- Create: `web/src/sheet/{ShareToggle.tsx,WriteBackDialog.tsx}`
- Modify: `web/src/pages/SheetPage.tsx`
- Test: `web/src/sheet/ShareToggle.test.tsx`, `web/src/sheet/WriteBackDialog.test.tsx`, `web/src/pages/SheetPage.test.tsx`

**Interfaces:**
- Consumes: `writeBack` の req/res（Task 5）、`useSheet`（Task 7）。

- [ ] **Step 1: 失敗するテストを書く**
  - ShareToggle: オンにすると `/sheets/{id}/shared` に `true` を書き、`{origin}/s/{id}` を表示してコピーボタンを出す。オフで `false`。
  - SheetPage（readOnly）: 編集 UI・保存状態・共有・書き戻しボタンを表示しない。`status === "not-found"` なら「シートが見つかりません（共有が無効になっている可能性があります）」を表示する。
  - WriteBackDialog: パスワードを入れて実行 → `writeBack({ sheetId, password })`。結果ごとの表示:
    - `ok` →「元サイトに反映しました」。パスワード欄を空にする。
    - `bad-password` →「パスワードが違います」。
    - `source-changed` →「元サイトは取り込み後に更新されています（取り込み時: {sourceLastUpdate} / 現在: {currentLastUpdate}）。上書きしますか？」→ OK で `force: true` を付けて再実行。
    - `unencodable` →「元サイトで使えない文字（絵文字など）が含まれています: {項目名の一覧}」。
    - `schema-changed` →「元サイトの入力項目が変わったため書き戻せません。取り込み直してください」。
    - `resource-exhausted` / `unavailable` → Task 6 と同じ文言。
  - ダイアログを閉じたらパスワードの state を破棄する。パスワード欄は `type="password"`、`autocomplete="off"`。
- [ ] **Step 2:** FAIL を確認する。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** PASS を確認する。
- [ ] **Step 5:** Commit `feat(web): share link and write-back dialog`

### Task 9: デプロイと実環境での確認

**Files:**
- Create: `README.md`（セットアップ、`pnpm fixtures`、Emulator での開発、デプロイ手順）
- Modify: なし（設定はこれまでのタスクで完了）

- [ ] **Step 1:** Firebase コンソールで Authentication の Google プロバイダを有効にし、Realtime Database を作成する（利用者が行う。リージョンは利用者に確認）。
- [ ] **Step 2:** 課金アカウント `01AB54-E6C0FC-844B1E` を `dnd-kanata` に紐付け、Firebase を有効化する（利用者が申請した課金上限の引き上げが承認されてから。実行前に利用者に確認する）。その後 `pnpm build` と `pnpm exec firebase deploy --only database,functions,hosting` を実行する（デプロイは利用者の確認を得てから行う）。
- [ ] **Step 3:** 本番 URL で、ログイン → 54555 を取り込み → HP を「−」で減らす → リロードで残っている → 共有をオンにしてシークレットウィンドウで `/s/{id}` が見える → 共有をオフにすると見えなくなる、を確認する。
- [ ] **Step 4:** 利用者と一緒に、テスト用キャラクターへの書き戻しを 1 回行い、元サイトの表示に反映されていることを確認する。
- [ ] **Step 5:** Commit `docs: README with setup and deploy steps`
