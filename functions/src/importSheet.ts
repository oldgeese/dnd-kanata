import { randomUUID } from "node:crypto";
import { getDatabase } from "firebase-admin/database";
import { logger } from "firebase-functions";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { encodeRecord, parseInputForm } from "@dnd-kanata/core";
import { checkRateLimit } from "./rateLimit";
import { fetchInputForm, parseSourceId, SourceError } from "./source";

export type ImportRequest = { source: string; overwrite?: boolean };
export type ImportResponse = { status: "created" | "overwritten" | "exists"; sheetId: string };

export async function importSheetHandler(request: Pick<CallableRequest<ImportRequest>, "auth" | "data">): Promise<ImportResponse> {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "ログインが必要です。");
  const data = request.data;
  const sourceId = typeof data?.source === "string" ? parseSourceId(data.source) : null;
  if (sourceId === null) throw new HttpsError("invalid-argument", "ID または URL が正しくありません。");

  const db = getDatabase();
  const sourceRef = db.ref(`users/${uid}/sources/${sourceId}`);
  const existing = (await sourceRef.get()).val() as string | null;
  if (existing && data.overwrite !== true) return { status: "exists", sheetId: existing };

  await checkRateLimit(uid);

  let parsed: ReturnType<typeof parseInputForm>;
  try {
    parsed = parseInputForm(await fetchInputForm(sourceId));
  } catch (e) {
    if (e instanceof SourceError) throw toHttpsError(e);
    logger.error("importSheet: failed to parse INPUT_FORM", { sourceId, error: String(e) });
    throw new HttpsError("unavailable", "元サイトのフォーム形式が想定と異なります。");
  }
  if (parsed.id !== String(sourceId)) throw new HttpsError("not-found", "指定の ID のキャラクターシートが見つかりません。");
  if (!parsed.schema.str) throw new HttpsError("unavailable", "元サイトのフォーム形式が想定と異なります。");

  const now = Date.now();
  const fields = encodeRecord(parsed.fields);
  const schema = encodeRecord(parsed.schema);

  if (existing) {
    await db.ref().update({
      [`sheets/${existing}/fields`]: fields,
      [`sheets/${existing}/schema`]: schema,
      [`sheets/${existing}/sourceLastUpdate`]: parsed.lastUpdate,
      [`sheets/${existing}/importedAt`]: now,
      [`sheets/${existing}/updatedAt`]: now,
    });
    return { status: "overwritten", sheetId: existing };
  }

  // Claim the source first so two concurrent first imports cannot both create a sheet.
  const sheetId = randomUUID();
  const claim = await sourceRef.transaction((current: string | null) => (current === null ? sheetId : undefined));
  if (!claim.committed) return { status: "exists", sheetId: claim.snapshot.val() as string };
  try {
    await db.ref().update({
      [`sheets/${sheetId}`]: {
        ownerUid: uid,
        sourceId,
        shared: false,
        fields,
        schema,
        sourceLastUpdate: parsed.lastUpdate,
        importedAt: now,
        updatedAt: now,
      },
      [`users/${uid}/sheets/${sheetId}`]: true,
    });
  } catch (e) {
    await sourceRef.remove().catch(() => undefined);
    throw e;
  }
  return { status: "created", sheetId };
}

function toHttpsError(e: SourceError): HttpsError {
  if (e.code === "not-found") return new HttpsError("not-found", "指定の ID のキャラクターシートが見つかりません。");
  return new HttpsError("unavailable", "元サイトに接続できませんでした。");
}

export const importSheet = onCall<ImportRequest>({ region: "asia-northeast1", invoker: "public" }, importSheetHandler);
