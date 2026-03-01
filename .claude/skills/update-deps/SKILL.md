---
name: update-deps
description: 依存ライブラリとDenoのバージョンをチェック・更新してテストを実行しPRを作成する
user-invocable: true
argument-hint: [--latest]
---

## 依存ライブラリ・Denoアップデートスキル

依存ライブラリ（`deno.json`）とDeno本体のバージョンを確認・更新し、テスト通過後にPRを作成する。

引数として `--latest` が渡された場合はメジャーアップデートを含む最新版に更新する。それ以外はsemver互換の範囲内で更新する。

### 手順

**0. 事前確認**

`main` ブランチが最新であることを確認し、作業ブランチを作成する：

```
git checkout main
git pull origin main
git checkout -b claude/update-deps-$(date +%Y%m%d)
```

**1. 現状確認**

以下のコマンドで現状のバージョンを収集する：

```
# Deno本体の更新確認
/home/satotoru/.deno/bin/deno upgrade --dry-run 2>&1

# 依存ライブラリの更新確認
/home/satotoru/.deno/bin/deno outdated 2>&1
```

収集した情報をもとに「現在のバージョン → 更新後のバージョン」を一覧化して**ユーザーに見せる**。

**2. 依存ライブラリの更新**

引数が `--latest` の場合：
```
/home/satotoru/.deno/bin/deno update --latest 2>&1
```

引数なし（semver互換）の場合：
```
/home/satotoru/.deno/bin/deno update 2>&1
```

`deno.json` が更新されたことを確認する。更新された依存がない場合はその旨を報告して終了する。

**3. リリースノートの確認**

更新対象の各ライブラリについて、リリースノートや CHANGELOG を Web で調査する：

- npm パッケージ: `https://github.com/<owner>/<repo>/releases` や `https://www.npmjs.com/package/<pkg>?activeTab=versions` を参照
- jsr パッケージ: `https://jsr.io/<scope>/<pkg>` を参照

旧バージョンから新バージョンまでの変更をすべて確認し、以下を判断する：
- **破壊的変更（Breaking Changes）があるか**
- 破壊的変更がある場合、**自プロジェクトのコードへの影響はあるか**（`src/` や `tests/` を grep して影響箇所を特定）

破壊的変更がある場合は修正プランを作成し、確認なしでそのプランに従って修正作業を行う。

**4. テスト実行と修正ループ**

```
/home/satotoru/.deno/bin/deno task test 2>&1
```

- **全テスト通過** → 手順5へ進む
- **テスト失敗** → 以下のループを行う（最大5回）：
  1. 失敗したテストとエラー内容を分析する
  2. リリースノートの破壊的変更と照らし合わせて原因を特定する
  3. `src/` または `tests/` の該当コードを修正する
  4. 再度テストを実行する
  5. 5回失敗した場合は修正を諦め、`git checkout` で変更を全て元に戻して終了する

**5. コミット・プッシュ**

```
git add deno.json deno.lock
git commit -m "chore: 依存ライブラリを更新

<更新した依存のリストをここに列挙>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin HEAD
```

コードの修正も行った場合は、別コミットまたは同じコミットにまとめて含める。

**6. PR作成**

`gh pr create` でPRを作成する。本文には以下を含める：

- 更新した依存ライブラリの一覧（パッケージ名・旧バージョン・新バージョン）
- 破壊的変更の有無と、対応した内容（修正したファイルや変更の概要）
- テスト結果（何件通過したか）
- `--latest` を使った場合はその旨と、メジャーアップデートがある場合は破壊的変更の可能性について注記

### 注意点

- `deno.lock` が存在する場合、`deno.json` と合わせてコミットに含める
- Deno本体のアップデートはこのスキルでは行わない（手動で `deno upgrade` を実行するよう案内するのみ）
- テストが5回失敗した場合は `git checkout` で変更を全て元に戻して終了すること
- `--latest` はメジャーバージョンアップを含むため、破壊的変更のリスクがある旨をユーザーに伝えてから実行すること
- リリースノートが見当たらない場合は GitHub の比較URL（`/compare/v<old>...v<new>`）や `CHANGELOG.md` を探すこと
