// 画面とタブに出すアプリ名。本番以外では本番と見分けられるよう「(開発用)」を付ける
export function appName(mode: string): string {
  return mode === "prod" ? "dnd-kanata" : "dnd-kanata(開発用)";
}
