import test from "node:test";
import assert from "node:assert/strict";

import {
  AVAILABLE_TAGS,
  buildAffiliateUrl,
  fetchBooks,
  generateTags,
  isEngineeringBook,
  normalizeBook,
  normalizeReleaseDate,
} from "../crawler/fetchBooks.js";

test("isEngineeringBook matches engineering keywords", () => {
  assert.equal(isEngineeringBook("Python実践入門"), true);
  assert.equal(isEngineeringBook("料理の基本"), false);
});

test("generateTags assigns multiple tags", () => {
  assert.deepEqual(
    generateTags("AWS Architecture with Python and Docker"),
    ["aws", "architecture", "python", "devops"],
  );
});

test("available tags expose stable ids and labels", () => {
  assert.equal(AVAILABLE_TAGS.find((tag) => tag.id === "aws")?.label, "AWS");
  assert.equal(AVAILABLE_TAGS.find((tag) => tag.id === "genai")?.sortOrder, 20);
});

test("normalizeReleaseDate normalizes Japanese dates", () => {
  assert.equal(normalizeReleaseDate("2026年03月10日"), "2026-03-10");
  assert.equal(normalizeReleaseDate("2026/03"), "2026-03-01");
});

test("buildAffiliateUrl always appends associate tag", () => {
  assert.equal(
    buildAffiliateUrl("https://www.amazon.co.jp/dp/1234567890", "1234567890", "yzak-nra-22"),
    "https://www.amazon.co.jp/dp/1234567890?tag=yzak-nra-22",
  );
});

test("normalizeBook returns app-compatible fields", () => {
  const book = normalizeBook(
    {
      ASIN: "1234567890",
      DetailPageURL: "https://www.amazon.co.jp/dp/1234567890",
      ItemInfo: {
        Title: { DisplayValue: "AWSとPythonで学ぶ設計入門" },
        ByLineInfo: {
          Contributors: [{ Name: "山田 太郎" }],
          Manufacturer: { DisplayValue: "技術評論社" },
        },
        ContentInfo: {
          PublicationDate: { DisplayValue: "2026-03-10" },
        },
      },
      Images: {
        Primary: {
          Medium: { URL: "https://example.com/book.jpg" },
        },
      },
      Offers: {
        Listings: [{ Price: { Amount: 3520, Currency: "JPY" } }],
      },
    },
    "yzak-nra-22",
  );

  assert.equal(book.title, "AWSとPythonで学ぶ設計入門");
  assert.deepEqual(book.tags, ["aws", "architecture", "python"]);
  assert.equal(book.amazonUrl, "https://www.amazon.co.jp/dp/1234567890?tag=yzak-nra-22");
});

test("fetchBooks retries throttled requests and continues on partial failure", async () => {
  let awsAttempts = 0;
  const apiClient = {
    async searchItems({ keywords }) {
      if (keywords === "AWS") {
        awsAttempts += 1;
        if (awsAttempts < 3) {
          const error = new Error("Creators API request failed (429): ThrottleException");
          error.status = 429;
          throw error;
        }

        return {
          searchResult: {
            items: [
              {
                asin: "111",
                detailPageURL: "https://www.amazon.co.jp/dp/111",
                itemInfo: {
                  title: { displayValue: "AWS設計ガイド" },
                  byLineInfo: {
                    contributors: [{ name: "著者A" }],
                    manufacturer: { displayValue: "出版社A" },
                  },
                  contentInfo: {
                    publicationDate: { displayValue: "2026-03-10" },
                  },
                },
              },
            ],
          },
        };
      }

      const error = new Error("Creators API request failed (500): boom");
      error.status = 500;
      throw error;
    },
  };

  const logger = {
    info() {},
    warn() {},
    error() {},
  };

  const books = await fetchBooks(apiClient, {
    associateTag: "yzak-nra-22",
    logger,
    searchKeywords: ["AWS", "Python"],
    keywordDelayMs: 0,
    throttleBackoffMs: [0, 0],
  });

  assert.equal(awsAttempts, 3);
  assert.equal(books.length, 1);
  assert.equal(books[0].asin, "111");
});
