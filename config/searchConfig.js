import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "search-config.json");

export function loadSearchConfig() {
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw);

  return {
    searchKeywords: parsed.searchKeywords ?? [],
    filterKeywords: parsed.filterKeywords ?? [],
    tagRules: parsed.tagRules ?? [],
    releaseWindowDays: parsed.releaseWindowDays ?? 30,
    computerItCategoryKeywords: parsed.computerItCategoryKeywords ?? [],
  };
}
