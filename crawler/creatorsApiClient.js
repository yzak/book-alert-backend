const DEFAULT_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

function toFormBody(params) {
  return new URLSearchParams(params).toString();
}

export class CreatorsApiClient {
  constructor({
    clientId,
    clientSecret,
    associateTag,
    scope,
    tokenUrl = process.env.CREATORS_API_TOKEN_URL ?? DEFAULT_TOKEN_URL,
    searchItemsUrl = process.env.CREATORS_API_SEARCH_ITEMS_URL,
    marketplace = process.env.CREATORS_API_MARKETPLACE ?? "www.amazon.co.jp",
  }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.associateTag = associateTag;
    this.scope = scope;
    this.tokenUrl = tokenUrl;
    this.searchItemsUrl = searchItemsUrl;
    this.marketplace = marketplace;
  }

  async searchItems({
    keywords,
    itemCount = 10,
    searchIndex = "Books",
    resources = [
      "Images.Primary.Medium",
      "ItemInfo.ByLineInfo",
      "ItemInfo.Classifications",
      "ItemInfo.ContentInfo",
      "ItemInfo.ProductInfo",
      "ItemInfo.Title",
      "Offers.Listings.Price",
    ],
  }) {
    if (!this.searchItemsUrl) {
      throw new Error(
        "CREATORS_API_SEARCH_ITEMS_URL is required. Set the Creators API SearchItems endpoint from Amazon's official API reference.",
      );
    }

    const accessToken = await this.#fetchAccessToken();

    // Inference: Creators API product search accepts a SearchItems-like JSON body.
    const payload = JSON.stringify({
      keywords,
      searchIndex,
      itemCount,
      marketplace: this.marketplace,
      associateTag: this.associateTag,
      resources,
    });

    const response = await fetch(this.searchItemsUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
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
    if (!this.scope) {
      throw new Error(
        "CREATORS_API_SCOPE is required. Set the OAuth scope from Amazon's Creators API docs.",
      );
    }

    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: toFormBody({
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
