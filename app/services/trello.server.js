const TRELLO_API_BASE_URL = "https://api.trello.com/1";

const REQUIRED_ENV_VARS = ["TRELLO_API_KEY"];
const DEFAULT_APP_NAME = "Shopify Trello Ticket Bridge";

class TrelloRequestError extends Error {
  constructor(message, { status, details } = {}) {
    super(message);
    this.name = "TrelloRequestError";
    this.status = status;
    this.details = details;
  }
}

export function readBaseTrelloConfig({ requestUrl } = {}) {
  const reportedMissing = new Set(
    REQUIRED_ENV_VARS.filter((name) => !process.env[name]),
  );

  const rawAppUrl = process.env.SHOPIFY_APP_URL?.trim();
  let appUrl = rawAppUrl ? rawAppUrl.replace(/\/$/, "") : "";

  if (!appUrl && requestUrl) {
    try {
      const derived = new URL(requestUrl);
      appUrl = `${derived.protocol}//${derived.host}`;
    } catch (_error) {
      // Ignore parsing issues; we'll report the missing value below.
    }
  }

  const rawCallback = process.env.TRELLO_CALLBACK_URL?.trim();
  let callbackUrl = rawCallback ? rawCallback.replace(/\/$/, "") : "";

  if (!callbackUrl && appUrl) {
    callbackUrl = `${appUrl}/trello/callback`;
  }

  let appOrigin;
  if (callbackUrl) {
    try {
      const parsed = new URL(callbackUrl);
      appOrigin = parsed.origin;

      if (!appUrl) {
        appUrl = appOrigin;
      }
    } catch (_error) {
      reportedMissing.add("TRELLO_CALLBACK_URL");
    }
  } else {
    reportedMissing.add("TRELLO_CALLBACK_URL");
  }

  if (!appUrl) {
    reportedMissing.add("SHOPIFY_APP_URL");
  }

  if (reportedMissing.size > 0) {
    return { ok: false, missing: Array.from(reportedMissing) };
  }

  return {
    ok: true,
    config: {
      apiKey: process.env.TRELLO_API_KEY || "",
      appUrl,
      appName: process.env.TRELLO_APP_NAME || DEFAULT_APP_NAME,
      callbackUrl,
      appOrigin,
    },
  };
}

export function buildAuthorizeUrl(baseConfig) {
  const url = new URL("https://trello.com/1/authorize");
  url.searchParams.set("key", baseConfig.apiKey);
  url.searchParams.set("scope", "read,write");
  url.searchParams.set("expiration", "never");
  url.searchParams.set("name", baseConfig.appName);
  url.searchParams.set("response_type", "token");
  url.searchParams.set(
    "return_url",
    baseConfig.callbackUrl,
  );
  url.searchParams.set("callback_method", "fragment");
  return url.toString();
}

async function trelloFetch(
  pathname,
  config,
  { method = "GET", search, body } = {},
) {
  const url = new URL(pathname, TRELLO_API_BASE_URL);
  url.searchParams.set("key", config.apiKey);
  url.searchParams.set("token", config.token);

  if (search) {
    Object.entries(search).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }

      url.searchParams.set(key, value);
    });
  }

  const headers = {
    Accept: "application/json",
  };

  if (body instanceof URLSearchParams) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
  });

  const contentType = response.headers.get("content-type") || "";
  const expectsJson = contentType.toLowerCase().includes("application/json");

  if (!response.ok) {
    let details;

    if (expectsJson) {
      try {
        details = await response.json();
      } catch {
        const fallbackBody = await response.text();
        details = fallbackBody.slice(0, 2000);
      }
    } else {
      const bodyText = await response.text();
      details = {
        contentType: contentType || "unknown",
        body: bodyText.slice(0, 2000),
      };
    }

    throw new TrelloRequestError("Trello API request failed", {
      status: response.status,
      details,
    });
  }

  if (!expectsJson) {
    const bodyText = await response.text();
    throw new TrelloRequestError("Unexpected Trello API response format", {
      status: response.status,
      details: {
        contentType: contentType || "unknown",
        body: bodyText.slice(0, 2000),
      },
    });
  }

  return response.json();
}

export async function fetchMemberBoards(config) {
  return trelloFetch("/members/me/boards", config, {
    search: {
      fields: "id,name",
      filter: "open",
    },
  });
}

export async function fetchBoardLists(config, boardId) {
  return trelloFetch(`/boards/${boardId}/lists`, config, {
    search: {
      fields: "id,name",
      filter: "open",
      sort: "pos",
    },
  });
}

export async function createCard(
  config,
  { name, desc, listId, due, labels, sourceUrl },
) {
  const body = new URLSearchParams({
    name,
    idList: listId,
  });

  if (desc) {
    body.set("desc", desc);
  }

  if (due) {
    body.set("due", due);
  }

  if (labels && labels.length > 0) {
    body.set("idLabels", labels.join(","));
  }

  if (sourceUrl) {
    body.set("urlSource", sourceUrl);
  }

  return trelloFetch("/cards", config, {
    method: "POST",
    body,
  });
}

export { TrelloRequestError };
