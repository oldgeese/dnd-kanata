export function encodeKey(name: string): string {
  return name.replace(/[%.$#\[\]\/]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
}
export function decodeKey(key: string): string {
  return key.replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
export function encodeRecord<T>(r: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [encodeKey(k), v]));
}
export function decodeRecord<T>(r: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [decodeKey(k), v]));
}
