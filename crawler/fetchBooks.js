import { loadSearchConfig } from "../config/searchConfig.js";

const {
  searchKeywords: SEARCH_KEYWORDS,
  filterKeywords: FILTER_KEYWORDS,
  tagRules: TAG_RULES,
} = loadSearchConfig();

const MAX_BOOKS = 200;
const KEYWORD_DELAY_MS = 1500;
const THROTTLE_BACKOFF_MS = [2000, 5000, 10000];

export const AVAILABLE_TAGS = TAG_RULES.map(({ id, label, sortOrder }) => ({
  id,
  label,
  sortOrder,
}));

export function buildAffiliateUrl(detailPageUrl, asin, associateTag) {
  if (!associateTag) {
    throw new Error("ASSOCIATE_TAG is required");
  }

  if (!detailPageUrl) {
    return `https://www.amazon.co.jp/dp/${asin}?tag=${associateTag}`;
  }

  const url = new URL(detailPageUrl);
  return `${url.origin}${url.pathname}?tag=${associateTag}`;
}

export function isEngineeringBook(title = "") {
  const normalized = title.toLowerCase();
  return FILTER_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function generateTags(sourceText) {
  const normalized = sourceText.toLowerCase();
  return TAG_RULES.filter(({ keywords }) =>
    keywords.some((keyword) => normalized.includes(keyword)),
  ).map(({ id }) => id);
}

export function normalizeReleaseDate(rawValue) {
  if (!rawValue) {
    return null;
  }

  if (typeof rawValue !== "string") {
    return null;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  const candidates = [
    [/^(\d{4})-(\d{2})-(\d{2})T.*$/, "$1-$2-$3"],
    [/^(\d{4})\/(\d{2})\/(\d{2})\s+.*$/, "$1-$2-$3"],
    [/^(\d{4})-(\d{2})-(\d{2})$/, "$1-$2-$3"],
    [/^(\d{4})\/(\d{2})\/(\d{2})$/, "$1-$2-$3"],
    [/^(\d{4})年(\d{2})月(\d{2})日$/, "$1-$2-$3"],
    [/^(\d{4})-(\d{2})$/, "$1-$2-01"],
    [/^(\d{4})\/(\d{2})$/, "$1-$2-01"],
    [/^(\d{4})年(\d{2})月$/, "$1-$2-01"],
  ];

  for (const [pattern, replacement] of candidates) {
    if (pattern.test(trimmed)) {
      return trimmed.replace(pattern, replacement);
    }
  }

  return null;
}

export function normalizeBook(item, associateTag) {
  const asin = item?.asin ?? item?.ASIN;
  const title =
    item?.itemInfo?.title?.displayValue ??
    item?.ItemInfo?.Title?.DisplayValue ??
    "";
  if (!asin || !title || !isEngineeringBook(title)) {
    return null;
  }

  const authors = (
    item?.itemInfo?.byLineInfo?.contributors ??
    item?.ItemInfo?.ByLineInfo?.Contributors ??
    []
  )
    .map((contributor) => contributor?.name ?? contributor?.Name)
    .filter(Boolean);
  const publisher =
    item?.itemInfo?.byLineInfo?.manufacturer?.displayValue ??
    item?.ItemInfo?.ByLineInfo?.Manufacturer?.DisplayValue ??
    "";
  const releaseDate = normalizeReleaseDate(
    item?.itemInfo?.productInfo?.releaseDate?.displayValue ??
      item?.ItemInfo?.ProductInfo?.ReleaseDate?.DisplayValue ??
      item?.itemInfo?.contentInfo?.publicationDate?.displayValue ??
      item?.ItemInfo?.ContentInfo?.PublicationDate?.DisplayValue,
  ) ?? new Date().toISOString().slice(0, 10);
  const image =
    item?.images?.primary?.medium?.url ??
    item?.Images?.Primary?.Medium?.URL ??
    "https://placehold.jp/240x320.png?text=No+Image";
  const price =
    item?.offersV2?.listings?.[0]?.price?.money?.amount ??
    item?.Offers?.Listings?.[0]?.Price?.Amount ??
    null;
  const currency =
    item?.offersV2?.listings?.[0]?.price?.money?.currency ??
    item?.Offers?.Listings?.[0]?.Price?.Currency ??
    "JPY";
  const detailPageUrl = buildAffiliateUrl(
    item?.detailPageURL ?? item?.DetailPageURL,
    asin,
    associateTag,
  );
  const tags = generateTags(
    [title, publisher, authors.join(" ")]
      .filter(Boolean)
      .join(" "),
  );

  return {
    id: asin,
    asin,
    title,
    author: authors.join(", "),
    authors,
    publisher,
    releaseDate,
    publishedAt: releaseDate,
    image,
    imageUrl: image,
    amazonUrl: detailPageUrl,
    detailPageUrl,
    tags: tags.length > 0 ? tags : ["general"],
    price: price === null ? null : Number(price),
    currency,
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isThrottleError(error) {
  return (
    error?.status === 429 ||
    error?.message?.includes("429") ||
    error?.message?.includes("ThrottleException")
  );
}

async function searchItemsWithRetry(apiClient, keyword, logger, backoffMs) {
  for (let attempt = 0; attempt <= backoffMs.length; attempt += 1) {
    try {
      return await apiClient.searchItems({ keywords: keyword });
    } catch (error) {
      const canRetry =
        isThrottleError(error) && attempt < backoffMs.length;
      if (!canRetry) {
        throw error;
      }

      const delayMs = backoffMs[attempt];
      logger.warn(
        `Throttle detected for "${keyword}" (attempt ${attempt + 1}). Retrying in ${delayMs}ms...`,
      );
      await wait(delayMs);
    }
  }

  throw new Error(`Unexpected retry flow reached for keyword: ${keyword}`);
}

export async function fetchBooks(
  apiClient,
  {
    associateTag,
    logger = console,
    searchKeywords = SEARCH_KEYWORDS,
    keywordDelayMs = KEYWORD_DELAY_MS,
    throttleBackoffMs = THROTTLE_BACKOFF_MS,
  } = {},
) {
  const booksById = new Map();
  const failures = [];

  for (const [index, keyword] of searchKeywords.entries()) {
    logger.info(`Searching keyword: ${keyword}`);
    try {
      const data = await searchItemsWithRetry(
        apiClient,
        keyword,
        logger,
        throttleBackoffMs,
      );
      const items = data?.searchResult?.items ?? data?.SearchResult?.Items ?? [];
      for (const item of items) {
        const normalized = normalizeBook(item, associateTag);
        if (!normalized) {
          continue;
        }

        const current = booksById.get(normalized.id);
        if (!current) {
          booksById.set(normalized.id, normalized);
          continue;
        }

        current.tags = [...new Set([...current.tags, ...normalized.tags])].sort();
      }
    } catch (error) {
      failures.push({ keyword, error });
      logger.error(
        `Skipping keyword "${keyword}" after failure: ${error.message}`,
      );
    }

    if (index < searchKeywords.length - 1) {
      await wait(keywordDelayMs);
    }
  }

  if (booksById.size === 0 && failures.length > 0) {
    throw failures[0].error;
  }

  if (failures.length > 0) {
    logger.warn(
      `Completed with partial success. Failed keywords: ${failures
        .map(({ keyword }) => keyword)
        .join(", ")}`,
    );
  }

  return [...booksById.values()]
    .sort((left, right) => right.releaseDate.localeCompare(left.releaseDate))
    .slice(0, MAX_BOOKS);
}
