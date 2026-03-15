import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAffiliateUrl,
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
    ["AWS", "Python", "DevOps", "Architecture"],
  );
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
  assert.deepEqual(book.tags, ["AWS", "Python", "Architecture"]);
  assert.equal(book.amazonUrl, "https://www.amazon.co.jp/dp/1234567890?tag=yzak-nra-22");
});
