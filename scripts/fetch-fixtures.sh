#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
UA='dnd-kanata (+https://github.com/oldgeese/dnd-kanata)'
mkdir -p fixtures
curl -fsS -A "$UA" -o fixtures/input_form_54555.html 'https://dndjp.sakura.ne.jp/INPUT_FORM.php?ID=54555'
sleep 1
curl -fsS -A "$UA" -o fixtures/dddb5e.js 'https://dndjp.sakura.ne.jp/dddb5e.js'
ls -l fixtures
