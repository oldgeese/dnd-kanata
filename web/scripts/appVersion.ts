import { execFileSync } from "node:child_process";

// git の出力を返す。git が無い・リポジトリ外・タグが無いなどで失敗したら null
export function git(...args: string[]): string | null {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

// 画面に出すバージョン。本番ではリリース番号（タグ名）、それ以外ではコミットハッシュ
export function appVersion(mode: string, env: NodeJS.ProcessEnv = process.env, run = git): string {
  if (mode === "prod") {
    // リリースのワークフローでは浅いクローンでタグを取得しないため、RELEASE_TAG で渡す
    const tag = env.RELEASE_TAG || run("describe", "--tags", "--exact-match", "HEAD");
    if (!tag) throw new Error("本番ビルドにはリリースのタグが必要です。RELEASE_TAG を指定するか、タグの付いたコミットでビルドしてください");
    return tag;
  }
  return run("rev-parse", "--short", "HEAD") ?? "unknown";
}
