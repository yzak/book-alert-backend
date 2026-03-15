import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchBooks } from "../crawler/fetchBooks.js";
import { PaapiClient } from "../crawler/paapiClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "data", "books.json");
const docsPath = path.join(repoRoot, "docs", "books.json");
const docsFlatPath = path.join(repoRoot, "docs", "books-flat.json");

const sampleBooks = [
  {
    id: "4297146080",
    asin: "4297146080",
    title: "実践AWSアーキテクチャ 第2版",
    author: "山田 太郎",
    authors: ["山田 太郎"],
    publisher: "技術評論社",
    releaseDate: "2026-03-10",
    publishedAt: "2026-03-10",
    image: "https://placehold.jp/240x320.png?text=AWS",
    imageUrl: "https://placehold.jp/240x320.png?text=AWS",
    amazonUrl: "https://www.amazon.co.jp/dp/4297146080?tag=yzak-nra-22",
    detailPageUrl: "https://www.amazon.co.jp/dp/4297146080?tag=yzak-nra-22",
    tags: ["AWS", "Architecture"],
    price: 3520,
    currency: "JPY",
  },
  {
    id: "4798188888",
    asin: "4798188888",
    title: "生成AIアプリ開発入門",
    author: "鈴木 花子",
    authors: ["鈴木 花子"],
    publisher: "翔泳社",
    releaseDate: "2026-03-08",
    publishedAt: "2026-03-08",
    image: "https://placehold.jp/240x320.png?text=AI",
    imageUrl: "https://placehold.jp/240x320.png?text=AI",
    amazonUrl: "https://www.amazon.co.jp/dp/4798188888?tag=yzak-nra-22",
    detailPageUrl: "https://www.amazon.co.jp/dp/4798188888?tag=yzak-nra-22",
    tags: ["AI", "Python"],
    price: 3300,
    currency: "JPY",
  },
  {
    id: "4815612345",
    asin: "4815612345",
    title: "KubernetesとDocker運用実践",
    author: "高橋 次郎",
    authors: ["高橋 次郎"],
    publisher: "SBクリエイティブ",
    releaseDate: "2026-03-05",
    publishedAt: "2026-03-05",
    image: "https://placehold.jp/240x320.png?text=DevOps",
    imageUrl: "https://placehold.jp/240x320.png?text=DevOps",
    amazonUrl: "https://www.amazon.co.jp/dp/4815612345?tag=yzak-nra-22",
    detailPageUrl: "https://www.amazon.co.jp/dp/4815612345?tag=yzak-nra-22",
    tags: ["DevOps"],
    price: 3080,
    currency: "JPY",
  },
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeBooksJson(books) {
  const payload = {
    updatedAt: new Date().toISOString(),
    books,
  };

  await ensureDir(dataPath);
  await ensureDir(docsPath);

  await fs.writeFile(dataPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.writeFile(docsPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.writeFile(
    docsFlatPath,
    JSON.stringify(
      books.map((book) => ({
        title: book.title,
        author: book.author,
        image: book.image,
        releaseDate: book.releaseDate,
        amazonUrl: book.amazonUrl,
        tags: book.tags,
      })),
      null,
      2,
    ),
    "utf8",
  );
}

async function main() {
  const useSample = process.argv.includes("--sample");

  if (useSample) {
    await writeBooksJson(sampleBooks);
    console.info("Wrote sample books.json");
    return;
  }

  const client = new PaapiClient({
    accessKey: requireEnv("PAAPI_ACCESS_KEY"),
    secretKey: requireEnv("PAAPI_SECRET_KEY"),
    associateTag: requireEnv("ASSOCIATE_TAG"),
  });

  const books = await fetchBooks(client, {
    associateTag: process.env.ASSOCIATE_TAG,
  });
  await writeBooksJson(books);
  console.info(`Wrote ${books.length} books`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
