// callable 共通のエラー文言（取り込み・書き戻しで共用）
export const RESOURCE_EXHAUSTED_MESSAGE = "操作が多すぎます。1 分ほど待ってから再度お試しください";
export const UNAVAILABLE_MESSAGE = "元サイトに接続できませんでした。時間をおいて再度お試しください";

export function errorCode(e: unknown): string {
  return String((e as { code?: unknown })?.code ?? "").replace(/^functions\//, "");
}
