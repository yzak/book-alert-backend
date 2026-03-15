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
  { id: "aws", label: "AWS", sortOrder: 10, keywords: ["aws", "amazon web services"] },
  { id: "genai", label: "生成AI", sortOrder: 20, keywords: ["生成ai", "generative ai", "stable diffusion"] },
  { id: "llm", label: "LLM", sortOrder: 30, keywords: ["llm", "rag", "langchain", "openai", "claude"] },
  { id: "architecture", label: "アーキテクチャ", sortOrder: 40, keywords: ["architecture", "アーキテクチャ", "設計"] },
  { id: "database", label: "Database", sortOrder: 50, keywords: ["database", "sql", "データベース", "postgresql", "mysql"] },
  { id: "software-test", label: "ソフトウェアテスト", sortOrder: 60, keywords: ["test", "testing", "ソフトウェアテスト", "qa", "品質保証"] },
  { id: "automation", label: "自動化", sortOrder: 70, keywords: ["automation", "自動化", "workflow", "ci/cd"] },
  { id: "engineering-management", label: "Engineering Management", sortOrder: 80, keywords: ["engineering management", "マネジメント", "組織"] },
  { id: "flutter", label: "Flutter", sortOrder: 90, keywords: ["flutter", "dart"] },
  { id: "python", label: "Python", sortOrder: 100, keywords: ["python", "django", "fastapi"] },
  { id: "ai", label: "AI", sortOrder: 110, keywords: ["ai", "machine learning", "deep learning"] },
  { id: "devops", label: "DevOps", sortOrder: 120, keywords: ["docker", "kubernetes", "devops", "platform engineering"] },
  { id: "general", label: "General", sortOrder: 999, keywords: [] },
];

const MAX_BOOKS = 200;

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

export async function fetchBooks(apiClient, { associateTag, logger = console } = {}) {
  const booksById = new Map();

  for (const keyword of SEARCH_KEYWORDS) {
    logger.info(`Searching keyword: ${keyword}`);
    const data = await apiClient.searchItems({ keywords: keyword });
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
  }

  return [...booksById.values()]
    .sort((left, right) => right.releaseDate.localeCompare(left.releaseDate))
    .slice(0, MAX_BOOKS);
}
