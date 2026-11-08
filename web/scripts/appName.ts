import type { Plugin } from "vite";

// 画面とタブに出すアプリ名。本番以外では本番と見分けられるよう「(開発用)」を付ける
export function appName(mode: string): string {
  return mode === "prod" ? "dnd-kanata" : "dnd-kanata(開発用)";
}

// index.html の __APP_NAME__ をアプリ名に置き換える。define は HTML には効かないため
export function appNameHtml(name: string): Plugin {
  return {
    name: "app-name-html",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => html.replaceAll("__APP_NAME__", name),
    },
  };
}
