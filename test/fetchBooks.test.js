import test from "node:test";
import assert from "node:assert/strict";

import {
  AVAILABLE_TAGS,
  buildAffiliateUrl,
  canonicalizeTitleForDedupe,
  extractBrowseNodeNames,
  fetchBooks,
  generateTags,
  isEngineeringBook,
  isReleaseWithinWindow,
  mergeBookEntries,
  matchesComputerItCategory,
  normalizeBook,
  preferBook,
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
  assert.equal(normalizeReleaseDate("2026-03-10T00:00:00Z"), "2026-03-10");
});

test("isReleaseWithinWindow only accepts books from the past 30 days", () => {
  const now = new Date("2026-03-17T00:00:00Z");

  assert.equal(
    isReleaseWithinWindow("2026-03-10", { now, releaseWindowDays: 30 }),
    true,
  );
  assert.equal(
    isReleaseWithinWindow("2026-02-10", { now, releaseWindowDays: 30 }),
    false,
  );
  assert.equal(
    isReleaseWithinWindow("2026-04-10", { now, releaseWindowDays: 30 }),
    false,
  );
});

test("browse node names can be extracted from creators api items", () => {
  const names = extractBrowseNodeNames({
    browseNodeInfo: {
      browseNodes: [
        {
          displayName: "プログラミング",
          ancestor: {
            displayName: "コンピュータ・IT",
          },
        },
      ],
    },
  });

  assert.deepEqual(names, ["プログラミング", "コンピュータ・IT"]);
});

test("matchesComputerItCategory accepts computer it browse nodes", () => {
  assert.equal(
    matchesComputerItCategory(
      {
        browseNodeInfo: {
          browseNodes: [{ displayName: "プログラミング" }],
        },
      },
      {
        sourceText: "タイトルだけでは判定しづらい本",
        categoryKeywords: ["プログラミング"],
      },
    ),
    true,
  );
});

test("canonicalizeTitleForDedupe removes series suffix differences", () => {
  assert.equal(
    canonicalizeTitleForDedupe(
      "Pythonではじめるクリーンアーキテクチャ (impress top gear)",
    ),
    canonicalizeTitleForDedupe(
      "Pythonではじめるクリーンアーキテクチャ (impress top gearシリーズ)",
    ),
  );
});

test("buildAffiliateUrl always appends associate tag", () => {
  assert.equal(
    buildAffiliateUrl("https://www.amazon.co.jp/dp/1234567890", "1234567890", "yzak-nra-22"),
    "https://www.amazon.co.jp/dp/1234567890?tag=yzak-nra-22",
  );
});

test("preferBook prefers non-kindle asin over kindle asin", () => {
  const physical = {
    asin: "429502404X",
    imageUrl: "https://example.com/physical.jpg",
  };
  const kindle = {
    asin: "B0GQ98V5H3",
    imageUrl: "https://example.com/kindle.jpg",
  };

  assert.deepEqual(preferBook(kindle, physical), physical);
  assert.deepEqual(preferBook(physical, kindle), physical);
});

test("mergeBookEntries merges tags while keeping preferred edition", () => {
  const result = mergeBookEntries(
    {
      asin: "B0GQ98V5H3",
      title: "Pythonではじめるクリーンアーキテクチャ",
      authors: ["A"],
      imageUrl: "https://example.com/kindle.jpg",
      tags: ["python"],
    },
    {
      asin: "429502404X",
      title: "Pythonではじめるクリーンアーキテクチャ",
      authors: ["A"],
      imageUrl: "https://example.com/physical.jpg",
      tags: ["architecture"],
    },
  );

  assert.equal(result.asin, "429502404X");
  assert.deepEqual(result.tags, ["architecture", "python"]);
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
        ProductInfo: {
          ReleaseDate: { DisplayValue: "2026-03-10T00:00:00Z" },
        },
        ContentInfo: {
          PublicationDate: { DisplayValue: "2026-02-01" },
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
    { now: new Date("2026-03-17T00:00:00Z") },
  );

  assert.equal(book.title, "AWSとPythonで学ぶ設計入門");
  assert.equal(book.releaseDate, "2026-03-10");
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
    now: new Date("2026-03-17T00:00:00Z"),
  });

  assert.equal(awsAttempts, 3);
  assert.equal(books.length, 1);
  assert.equal(books[0].asin, "111");
});

test("fetchBooks dedupes kindle and physical editions into one book", async () => {
  const apiClient = {
    async searchItems() {
      return {
        searchResult: {
          items: [
            {
              asin: "429502404X",
              detailPageURL: "https://www.amazon.co.jp/dp/429502404X",
              itemInfo: {
                title: {
                  displayValue:
                    "Pythonではじめるクリーンアーキテクチャ (impress top gear)",
                },
                byLineInfo: {
                  contributors: [{ name: "著者A" }],
                  manufacturer: { displayValue: "インプレス" },
                },
                contentInfo: {
                  publicationDate: { displayValue: "2026-03-04" },
                },
              },
              images: {
                primary: {
                  medium: { url: "https://example.com/physical.jpg" },
                },
              },
            },
            {
              asin: "B0GQ98V5H3",
              detailPageURL: "https://www.amazon.co.jp/dp/B0GQ98V5H3",
              itemInfo: {
                title: {
                  displayValue:
                    "Pythonではじめるクリーンアーキテクチャ (impress top gearシリーズ)",
                },
                byLineInfo: {
                  contributors: [{ name: "著者A" }],
                  manufacturer: { displayValue: "インプレス" },
                },
                contentInfo: {
                  publicationDate: { displayValue: "2026-03-04" },
                },
              },
              images: {
                primary: {
                  medium: { url: "https://example.com/kindle.jpg" },
                },
              },
            },
          ],
        },
      };
    },
  };

  const books = await fetchBooks(apiClient, {
    associateTag: "yzak-nra-22",
    logger: { info() {}, warn() {}, error() {} },
    searchKeywords: ["Python"],
    keywordDelayMs: 0,
    throttleBackoffMs: [0],
    now: new Date("2026-03-17T00:00:00Z"),
  });

  assert.equal(books.length, 1);
  assert.equal(books[0].asin, "429502404X");
});
