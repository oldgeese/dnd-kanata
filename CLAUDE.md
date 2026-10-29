# dnd-kanata

## Pull requests

PR を作成したとき、また開いている PR があるブランチ（`gh pr view` で確認）に新しいコミットを push したときは、組み込みの `/code-review high --max-findings default <PR 番号>` でレビューする。指摘はチャットで報告するだけにとどめ（`--comment` や `--fix` は付けない）、対応はユーザーが決めてからマージ前に行う。push 後のレビューでは、すでに判断済みの指摘は省いて新しいものだけを報告する。
