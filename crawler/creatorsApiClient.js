const DEFAULT_TOKEN_URL = "https://api.amazon.co.jp/auth/o2/token";
const DEFAULT_SCOPE = "creatorsapi::default";
const DEFAULT_SEARCH_ITEMS_URL =
  "https://creatorsapi.amazon/catalog/v1/searchItems";
const DEFAULT_CREDENTIAL_VERSION = "3.3";

function normalizeOptional(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export class CreatorsApiClient {
  constructor({
    clientId,
    clientSecret,
    associateTag,
    scope = process.env.CREATORS_API_SCOPE,
    tokenUrl = process.env.CREATORS_API_TOKEN_URL,
    searchItemsUrl = process.env.CREATORS_API_SEARCH_ITEMS_URL,
    marketplace = process.env.CREATORS_API_MARKETPLACE,
    credentialVersion = process.env.CREATORS_API_CREDENTIAL_VERSION,
  }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.associateTag = associateTag;
    this.scope = normalizeOptional(scope, DEFAULT_SCOPE);
    this.tokenUrl = normalizeOptional(tokenUrl, DEFAULT_TOKEN_URL);
    this.searchItemsUrl = normalizeOptional(
      searchItemsUrl,
      DEFAULT_SEARCH_ITEMS_URL,
    );
    this.marketplace = normalizeOptional(marketplace, "www.amazon.co.jp");
    this.credentialVersion = normalizeOptional(
      credentialVersion,
      DEFAULT_CREDENTIAL_VERSION,
    );
  }

  async searchItems({
    keywords,
    itemCount = 10,
    searchIndex = "Books",
    resources = [
      "images.primary.medium",
      "itemInfo.byLineInfo",
      "itemInfo.classifications",
      "itemInfo.contentInfo",
      "itemInfo.productInfo",
      "itemInfo.title",
      "offersV2.listings.price",
    ],
  }) {
    const accessToken = await this.#fetchAccessToken();

    const payload = JSON.stringify({
      partnerTag: this.associateTag,
      keywords,
      searchIndex,
      itemCount,
      marketplace: this.marketplace,
      resources,
    });

    const response = await fetch(this.searchItemsUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "x-marketplace": this.marketplace,
      },
      body: payload,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Creators API request failed (${response.status}): ${body}`);
    }

    return response.json();
  }

  async #fetchAccessToken() {
    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: this.scope,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LWA token request failed (${response.status}): ${body}`);
    }

    const data = await response.json();
    if (!data.access_token) {
      throw new Error(`LWA token response did not include access_token: ${JSON.stringify(data)}`);
    }

    return data.access_token;
  }
}
