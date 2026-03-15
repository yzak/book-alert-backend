const SEARCH_KEYWORDS = [
  "AWS",
  "Python",
  "生成AI",
  "LLM",
  "Docker",
  "Kubernetes",
  "Database",
  "Software Architecture",
  "エンジニアリングマネジメント",
];

const FILTER_KEYWORDS = [
  "aws",
  "ai",
  "python",
  "docker",
  "kubernetes",
  "sql",
  "データベース",
  "アーキテクチャ",
  "プログラミング",
  "llm",
  "生成ai",
  "engineering management",
];

const TAG_RULES = [
  { tag: "AWS", keywords: ["aws", "amazon web services"] },
  { tag: "Python", keywords: ["python", "django", "fastapi"] },
  { tag: "AI", keywords: ["ai", "生成ai", "llm", "rag", "langchain"] },
  { tag: "DevOps", keywords: ["docker", "kubernetes", "devops", "platform engineering"] },
  { tag: "Database", keywords: ["database", "sql", "データベース", "postgresql", "mysql"] },
  { tag: "Architecture", keywords: ["architecture", "アーキテクチャ", "設計"] },
  { tag: "Management", keywords: ["engineering management", "マネジメント", "組織"] },
];

const MAX_BOOKS = 200;

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
  ).map(({ tag }) => tag);
}

export function normalizeReleaseDate(rawValue) {
  if (!rawValue) {
    return null;
  }

  const candidates = [
    [/^(\d{4})-(\d{2})-(\d{2})$/, "$1-$2-$3"],
    [/^(\d{4})\/(\d{2})\/(\d{2})$/, "$1-$2-$3"],
    [/^(\d{4})年(\d{2})月(\d{2})日$/, "$1-$2-$3"],
    [/^(\d{4})-(\d{2})$/, "$1-$2-01"],
    [/^(\d{4})\/(\d{2})$/, "$1-$2-01"],
    [/^(\d{4})年(\d{2})月$/, "$1-$2-01"],
  ];

  for (const [pattern, replacement] of candidates) {
    if (pattern.test(rawValue)) {
      return rawValue.replace(pattern, replacement);
    }
  }

  return null;
}

export function normalizeBook(item, associateTag) {
  const asin = item?.ASIN;
  const title = item?.ItemInfo?.Title?.DisplayValue ?? "";
  if (!asin || !title || !isEngineeringBook(title)) {
    return null;
  }

  const authors = (item?.ItemInfo?.ByLineInfo?.Contributors ?? [])
    .map((contributor) => contributor?.Name)
    .filter(Boolean);
  const publisher = item?.ItemInfo?.ByLineInfo?.Manufacturer?.DisplayValue ?? "";
  const releaseDate =
    normalizeReleaseDate(
      item?.ItemInfo?.ContentInfo?.PublicationDate?.DisplayValue,
    ) ?? new Date().toISOString().slice(0, 10);
  const image =
    item?.Images?.Primary?.Medium?.URL ??
    "https://placehold.jp/240x320.png?text=No+Image";
  const price = item?.Offers?.Listings?.[0]?.Price?.Amount ?? null;
  const currency = item?.Offers?.Listings?.[0]?.Price?.Currency ?? "JPY";
  const detailPageUrl = buildAffiliateUrl(
    item?.DetailPageURL,
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
    tags: tags.length > 0 ? tags : ["General"],
    price: price === null ? null : Number(price),
    currency,
  };
}

export async function fetchBooks(paapiClient, { associateTag, logger = console } = {}) {
  const booksById = new Map();

  for (const keyword of SEARCH_KEYWORDS) {
    logger.info(`Searching keyword: ${keyword}`);
    const data = await paapiClient.searchItems({ keywords: keyword });
    const items = data?.SearchResult?.Items ?? [];
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
  }

  return [...booksById.values()]
    .sort((left, right) => right.releaseDate.localeCompare(left.releaseDate))
    .slice(0, MAX_BOOKS);
}
