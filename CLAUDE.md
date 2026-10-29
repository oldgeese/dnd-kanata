# dnd-kanata

## Pull requests

- PR を作成したら、組み込みの `/code-review high --max-findings default <PR 番号>` でレビューする。
- 開いている PR があるブランチ（`gh pr view <ブランチ> --json number,state` の state が `OPEN`）に、レビュー指摘への対応以外のコミットを push したときも、同じようにレビューする。
- 指摘はチャットで報告するだけにとどめる（`--comment` や `--fix` は付けない）。対応はユーザーが決めてからマージ前に行う。
- レビュー指摘への対応はまとめて1回で push する。この push のあとの再レビューは、ユーザーが求めたときだけ行う。
- push 後のレビューでは、すでに判断済みの指摘は省いて新しいものだけを報告する。
