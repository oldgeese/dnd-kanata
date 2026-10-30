# dnd-kanata

キャラクターシートを Firebase 上で扱うための Web アプリです。フロントエンドは React + Vite、バックエンドは Firebase (Realtime Database / Cloud Functions / Hosting) で構成された pnpm ワークスペースのモノレポです。

- `web/` : フロントエンド (Vite + React)
- `functions/` : Cloud Functions
- `packages/core` : 共有ロジック

設計書・実装計画: [設計](docs/superpowers/specs/2026-10-28-dnd-kanata-design.md) / [計画](docs/superpowers/plans/2026-10-28-dnd-kanata.md)

## 前提

- [mise](https://mise.jdx.dev/) (Node.js / pnpm / Java のバージョンは `mise.toml` で管理)

## セットアップ

```sh
mise install
pnpm install
pnpm fixtures   # テスト用フィクスチャを取得元サイトから取得 (fixtures/ は git 管理外)
```

## ローカル開発 (エミュレータ)

```sh
pnpm --filter functions build
pnpm exec firebase emulators:start --project demo-dnd-kanata
# 別ターミナルで
pnpm --filter web dev
```

## テスト

```sh
pnpm test
```

functions のテストは `firebase emulators:exec` 内で実行されるため Java が必要です (mise で導入されます)。

## 環境

| 環境 | Firebase プロジェクト | URL | Vite モード |
| --- | --- | --- | --- |
| dev | `dnd-kanata-dev` | https://dnd-kanata-dev.web.app | `dev` (`web/.env.dev`) |
| prod | `dnd-kanata` | https://dnd-kanata.web.app | `prod` (`web/.env.prod`) |

Authentication では、どちらの環境でも次のログイン方法を有効にしておきます (Firebase コンソールの Authentication > Sign-in method)。

- Google
- メール / パスワードの「メールリンク (パスワードなしでログイン)」。パスワードでのログインは使わないため無効のままにします

ログイン用のメールの件名と本文にはプロジェクトの公開名が入るので、どちらの環境でも公開名を `dnd-kanata` にしておきます (Firebase コンソールの プロジェクトの設定 > 全般)。

エミュレータでは、送ったはずのログイン用リンクがエミュレータのログと Emulator UI に出力されます。

Firebase の Web 設定は公開前提の値のため `web/.env.dev` / `web/.env.prod` をコミットしています。`.firebaserc` の default は誤デプロイ防止のため dev です。

## デプロイ

GitHub Actions (Workload Identity Federation で認証) が自動で行います。

- `main` へマージ: テスト後、dev 環境へデプロイ (`.github/workflows/deploy-dev.yml`)
- GitHub Release を publish: そのタグをチェックアウトし、テスト後、prod 環境へデプロイ (`.github/workflows/deploy-prod.yml`)
- Pull Request: テストのみ (`.github/workflows/ci.yml`)

手動でデプロイする場合は `firebase login` 済みの状態で次を実行します。

```sh
pnpm deploy:dev
pnpm deploy:prod
```
