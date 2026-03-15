# book-alert-backend

Amazon Creators API からエンジニア向け新刊を取得し、GitHub Pages の `docs/` へ JSON を公開する GitHub-only バックエンドです。サーバーは使わず、GitHub Actions の定期実行だけで運用します。

## Architecture

```text
GitHub Actions (weekly/manual)
        |
        v
Amazon Creators API
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
    creatorsApiClient.js
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
export CREATORS_API_CLIENT_ID=amzn1.application-oa2-client....
export CREATORS_API_CLIENT_SECRET=...
export CREATORS_API_SCOPE=...
export CREATORS_API_SEARCH_ITEMS_URL=...
export ASSOCIATE_TAG=yzak-nra-22
npm run build
```

`CREATORS_API_SCOPE` と `CREATORS_API_SEARCH_ITEMS_URL` は Amazon Creators API の公式リファレンスで確認した値を設定してください。

## GitHub Secrets

Repository secrets に以下を設定します。

- `CREATORS_API_CLIENT_ID`
- `CREATORS_API_CLIENT_SECRET`
- `CREATORS_API_SCOPE`
- `CREATORS_API_SEARCH_ITEMS_URL`
- `CREATORS_API_TOKEN_URL` 任意。通常は不要
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
- OAuth2 `client_credentials` で Login with Amazon アクセストークンを取得します
- Product search の呼び出し先は Amazon Creators API の公式リファレンス値を使います
- 新刊候補はタイトルキーワードでエンジニア向けに絞り込みます
- JSON は release date 降順、重複除外、最大 200 件に制限します

## Migration Note

2026年時点で PA-API 5.0 から Creators API への移行案内が出ているため、認証方式は Access Key / Secret Key ではなく OAuth クライアント ID / クライアントシークレット前提に切り替えています。`amzn1.application-oa2-client...` 形式の認証情報 ID は `CREATORS_API_CLIENT_ID` に設定します。
