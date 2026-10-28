import { readFileSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { build } from "esbuild";

// デプロイ用ディレクトリ (functions/dist) を生成する。
// Cloud Build は `npm install` を実行するため、workspace:* を含む元の package.json は使えない。
// バンドル済みコードと、ランタイム依存のみの最小 package.json をここに出力する。
const src = JSON.parse(readFileSync("package.json", "utf8"));
const externals = ["firebase-admin", "firebase-functions"];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  external: externals.flatMap((n) => [n, `${n}/*`]),
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
});

writeFileSync(
  "dist/package.json",
  JSON.stringify(
    {
      name: src.name,
      private: true,
      type: "module",
      main: "index.js",
      engines: { node: src.engines.node },
      dependencies: Object.fromEntries(externals.map((n) => [n, src.dependencies[n]])),
    },
    null,
    2,
  ) + "\n",
);

// firebase-tools はデプロイ時 (ローカルでの解析) とエミュレータで source 直下の node_modules から
// firebase-functions を解決するため、開発用 node_modules へリンクする。
// firebase.json の ignore で node_modules はアップロードされず、Cloud Build 側で npm install される。
symlinkSync("../node_modules", "dist/node_modules", "dir");
