// vite.config.ts の define でビルド時に埋め込む。本番ではリリース番号、それ以外ではコミットハッシュ
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  // vite.config.ts の define でビルド時に埋め込む。本番以外では「(開発用)」が付く
  readonly VITE_APP_NAME: string;
}
