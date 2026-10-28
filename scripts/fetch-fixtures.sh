#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
UA='dnd-kanata (+https://github.com/oldgeese/dnd-kanata)'
mkdir -p fixtures
curl -fsS -A "$UA" -o fixtures/input_form_54555.html 'https://dndjp.sakura.ne.jp/INPUT_FORM.php?ID=54555'
sleep 1
curl -fsS -A "$UA" -o fixtures/dddb5e.js 'https://dndjp.sakura.ne.jp/dddb5e.js'
sleep 1
# A successful write-back returns the same display page as a plain GET of OUTPUT.php.
curl -fsS -A "$UA" -o fixtures/writeback_ok.html 'https://dndjp.sakura.ne.jp/OUTPUT.php?ID=54555'
# The bad-password response, as captured from the source site; built locally so CI never POSTs a wrong password.
printf '%s\n%s\n%s' '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">' '<html lang="ja">' \
  'パスワードが違います。ブラウザの戻るボタンで戻ってください。' | iconv -f utf-8 -t cp932 >fixtures/writeback_bad_password.html
ls -l fixtures
