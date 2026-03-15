# book-alert-backend

Amazon Product Advertising API からエンジニア向け新刊を取得し、GitHub Pages の `docs/` へ JSON を公開する GitHub-only バックエンドです。サーバーは使わず、GitHub Actions の定期実行だけで運用します。

## Architecture

```text
GitHub Actions (weekly/manual)
        |
        v
Amazon PA-API SearchItems
        |
        v
Normalize / filter / tag
        |
        +--> data/books.json
        |
        +--> docs/books.json
        +--> docs/books-flat.json
        |
        v
GitHub Pages
```

## Repository Layout

```text
book-alert-backend/
  .github/workflows/crawl.yml
  crawler/
    fetchBooks.js
    paapiClient.js
  scripts/
    generateBooksJson.js
  data/
    books.json
  docs/
    books.json
    books-flat.json
  test/
    fetchBooks.test.js
  package.json
  README.md
```

## Setup

```bash
cd /Users/y.suzuki/develop/apps/book-alert-backend
npm install
npm test
node scripts/generateBooksJson.js --sample
```

本番データ生成時は以下の Secrets 相当の環境変数が必要です。

```bash
export PAAPI_ACCESS_KEY=...
export PAAPI_SECRET_KEY=...
export ASSOCIATE_TAG=yzak-nra-22
npm run build
```

## GitHub Secrets

Repository secrets に以下を設定します。

- `PAAPI_ACCESS_KEY`
- `PAAPI_SECRET_KEY`
- `ASSOCIATE_TAG`

認証情報はリポジトリにハードコードしていません。

## GitHub Actions

Workflow は [crawl.yml](/Users/y.suzuki/develop/apps/book-alert-backend/.github/workflows/crawl.yml) です。

- 毎週日曜 00:00 UTC に実行
- `workflow_dispatch` で手動実行可能
- `data/books.json` と `docs/books.json` を更新
- 変更があれば自動コミットして push

## GitHub Pages

GitHub Pages は `docs/` ディレクトリ公開を使います。

1. GitHub repository の `Settings > Pages` を開く
2. `Build and deployment` で `Deploy from a branch` を選ぶ
3. Branch を `main`、folder を `/docs` に設定する
4. 公開 URL `https://yzak.github.io/book-alert-backend/books.json` を確認する

`docs/books-flat.json` も同時に公開されます。既存アプリ互換のため、`docs/books.json` は `updatedAt` と `books` を持つ構造にしています。

## Notes

- Amazon HTML スクレイピングはしていません
- Amazon Product Advertising API の `SearchItems` を使います
- 新刊候補はタイトルキーワードでエンジニア向けに絞り込みます
- JSON は release date 降順、重複除外、最大 200 件に制限します
