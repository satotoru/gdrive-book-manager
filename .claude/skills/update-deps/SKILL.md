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

**3. テスト実行**

```
/home/satotoru/.deno/bin/deno task test 2>&1
```

- **全テスト通過** → 手順4へ進む
- **テスト失敗** → 失敗したテストを明示し、`deno.json` を元に戻して（`git checkout deno.json`）終了する。失敗した依存のみスキップして再試行はしない

**4. コミット・プッシュ**

```
git add deno.json deno.lock
git commit -m "chore: 依存ライブラリを更新

<更新した依存のリストをここに列挙>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin HEAD
```

**5. PR作成**

`gh pr create` でPRを作成する。本文には以下を含める：

- 更新した依存ライブラリの一覧（パッケージ名・旧バージョン・新バージョン）
- テスト結果（何件通過したか）
- `--latest` を使った場合はその旨と、メジャーアップデートがある場合は破壊的変更の可能性について注記

### 注意点

- `deno.lock` が存在する場合、`deno.json` と合わせてコミットに含める
- Deno本体のアップデートはこのスキルでは行わない（手動で `deno upgrade` を実行するよう案内するのみ）
- テストが失敗した場合は変更を元に戻すこと
- `--latest` はメジャーバージョンアップを含むため、破壊的変更のリスクがある旨をユーザーに伝えてから実行すること
