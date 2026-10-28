import { getDatabase } from "firebase-admin/database";
import { HttpsError } from "firebase-functions/v2/https";

export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** import と write-back 共通。直近 60 秒に 5 件あれば resource-exhausted。 */
export async function checkRateLimit(uid: string, now: number = Date.now()): Promise<void> {
  const ref = getDatabase().ref(`rateLimits/${uid}`);
  const result = await ref.transaction((cur: Record<string, number> | null) => {
    const recent = Object.entries(cur ?? {}).filter(([, t]) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX) return; // abort
    return { ...Object.fromEntries(recent), [`k${now}_${Math.random().toString(36).slice(2, 8)}`]: now };
  });
  if (!result.committed) throw new HttpsError("resource-exhausted", "リクエストが多すぎます。しばらく待ってください。");
}
