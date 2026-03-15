import crypto from "node:crypto";

const SERVICE = "ProductAdvertisingAPI";
const HOST = process.env.PAAPI_HOST ?? "webservices.amazon.co.jp";
const REGION = process.env.PAAPI_REGION ?? "us-west-2";
const ENDPOINT = `https://${HOST}/paapi5/searchitems`;
const TARGET = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems";

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key, value) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest();
}

function buildSigningKey(secretKey, dateStamp) {
  const dateKey = hmac(`AWS4${secretKey}`, dateStamp);
  const regionKey = hmac(dateKey, REGION);
  const serviceKey = hmac(regionKey, SERVICE);
  return hmac(serviceKey, "aws4_request");
}

export class PaapiClient {
  constructor({
    accessKey,
    secretKey,
    associateTag,
    partnerType = "Associates",
    marketplace = "www.amazon.co.jp",
  }) {
    this.accessKey = accessKey;
    this.secretKey = secretKey;
    this.associateTag = associateTag;
    this.partnerType = partnerType;
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
    const payload = JSON.stringify({
      Keywords: keywords,
      Marketplace: this.marketplace,
      SearchIndex: searchIndex,
      ItemCount: itemCount,
      PartnerTag: this.associateTag,
      PartnerType: this.partnerType,
      Resources: resources,
    });

    const headers = this.#buildHeaders(payload);
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: payload,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`PA-API request failed (${response.status}): ${body}`);
    }

    return response.json();
  }

  #buildHeaders(payload) {
    const now = new Date();
    const amzDate = now.toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256(payload);
    const canonicalHeaders = [
      "content-encoding:amz-1.0",
      "content-type:application/json; charset=utf-8",
      `host:${HOST}`,
      `x-amz-date:${amzDate}`,
      `x-amz-target:${TARGET}`,
      "",
    ].join("\n");
    const signedHeaders = "content-encoding;content-type;host;x-amz-date;x-amz-target";
    const canonicalRequest = [
      "POST",
      "/paapi5/searchitems",
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      sha256(canonicalRequest),
    ].join("\n");
    const signature = crypto
      .createHmac("sha256", buildSigningKey(this.secretKey, dateStamp))
      .update(stringToSign, "utf8")
      .digest("hex");

    return {
      "content-encoding": "amz-1.0",
      "content-type": "application/json; charset=utf-8",
      host: HOST,
      "x-amz-date": amzDate,
      "x-amz-target": TARGET,
      authorization: [
        "AWS4-HMAC-SHA256",
        `Credential=${this.accessKey}/${scope},`,
        `SignedHeaders=${signedHeaders},`,
        `Signature=${signature}`,
      ].join(" "),
    };
  }
}
