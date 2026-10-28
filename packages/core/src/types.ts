export type Fields = Record<string, string>;
export type FieldKind = "text" | "textarea" | "select" | "checkbox" | "hidden";
export interface FieldDef {
  kind: FieldKind;
  order: number;
  readonly?: true;
  options?: { value: string; label: string }[]; // select のみ
  checkedValue?: string; // checkbox のみ
}
export type FormSchema = Record<string, FieldDef>;
export interface Derived {
  value: string;
  parts?: { label: string; value: string }[];
}
export interface Sheet {
  // DB 上の形（キーは encodeKey 済み）
  ownerUid: string;
  sourceId: number;
  shared: boolean;
  fields: Fields;
  schema: FormSchema;
  sourceLastUpdate: string;
  importedAt: number;
  updatedAt: number;
}
