import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  buildAuthorizeUrl,
  createCard,
  fetchBoardLists,
  fetchMemberBoards,
  readBaseTrelloConfig,
  TrelloRequestError,
} from "../services/trello.server";
import {
  getTrelloConfigForShop,
  upsertTrelloToken,
  updateTrelloSelection,
} from "../models/trello-config.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
};

const jsonWithCors = (data, init = {}) =>
  Response.json(data, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });

const isHtmlErrorDetails = (error) => {
  if (!(error instanceof TrelloRequestError)) {
    return false;
  }

  const details = error.details;

  if (typeof details !== "object" || details === null) {
    return false;
  }

  const contentType = details.contentType?.toString().toLowerCase();

  return Boolean(contentType && contentType.includes("text/html"));
};

const summarizeHtmlDetails = (details) => {
  if (!details || typeof details !== "object" || !details.body) {
    return null;
  }

  const raw = details.body.toString();
  const withoutTags = raw.replace(/<[^>]+>/g, " ");
  return withoutTags.replace(/\s+/g, " ").trim().slice(0, 500);
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const { ok, missing, config: baseConfig } = readBaseTrelloConfig({
    requestUrl: request.url,
  });

  if (!ok) {
    return jsonWithCors({
      status: "missing_env",
      missingEnv: missing,
    });
  }

  const authorizeUrl = buildAuthorizeUrl(baseConfig);
  const trelloRecord = await getTrelloConfigForShop(session.shop);
  const allowedOrigin = baseConfig.appOrigin;

  if (!trelloRecord || !trelloRecord.token) {
    return jsonWithCors({
      status: "needs_token",
      authorizeUrl,
      missingEnv: [],
      allowedOrigin,
    });
  }

  const authConfig = {
    apiKey: baseConfig.apiKey,
    token: trelloRecord.token,
  };

  try {
    const boards = await fetchMemberBoards(authConfig);
    const simplifiedBoards = boards.map((board) => ({
      id: board.id,
      name: board.name,
    }));

    const hasStoredBoard = Boolean(
      trelloRecord.boardId &&
        simplifiedBoards.some((board) => board.id === trelloRecord.boardId),
    );

    const lists = hasStoredBoard
      ? await fetchBoardLists(authConfig, trelloRecord.boardId)
      : [];

    const simplifiedLists = lists.map((list) => ({
      id: list.id,
      name: list.name,
    }));

    const hasStoredList = Boolean(
      trelloRecord.listId &&
        simplifiedLists.some((list) => list.id === trelloRecord.listId),
    );

    const status =
      hasStoredBoard && hasStoredList ? "ready" : "needs_selection";

    return jsonWithCors({
      status,
      authorizeUrl,
      boards: simplifiedBoards,
      lists: simplifiedLists,
      selectedBoardId: hasStoredBoard ? trelloRecord.boardId : null,
      selectedBoardName: hasStoredBoard ? trelloRecord.boardName : null,
      selectedListId: hasStoredList ? trelloRecord.listId : null,
      selectedListName: hasStoredList ? trelloRecord.listName : null,
      missingEnv: [],
      allowedOrigin,
    });
  } catch (error) {
    if (isHtmlErrorDetails(error)) {
      return jsonWithCors({
        status: "needs_token",
        authorizeUrl,
        boards: [],
        lists: [],
        selectedBoardId: null,
        selectedBoardName: null,
        selectedListId: null,
        selectedListName: null,
        missingEnv: [],
        allowedOrigin,
        trelloError:
          "Your Trello connection is no longer valid. Reconnect Trello to continue.",
        trelloDetails: summarizeHtmlDetails(error.details),
      });
    }

    if (error instanceof TrelloRequestError) {
      return jsonWithCors(
        {
          status: "token_error",
          authorizeUrl,
          trelloError: error.message,
          trelloDetails: error.details,
          missingEnv: [],
          allowedOrigin,
        },
        { status: 502 },
      );
    }

    throw error;
  }
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const { ok, missing, config: baseConfig } = readBaseTrelloConfig({
    requestUrl: request.url,
  });
  if (!ok) {
    return jsonWithCors(
      {
        ok: false,
        error: `Missing Trello configuration: ${missing.join(", ")}`,
      },
      { status: 500 },
    );
  }

  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent === "saveToken") {
    const token = formData.get("token")?.toString().trim();

    if (!token) {
      return jsonWithCors(
        { ok: false, intent, error: "Trello access token is required." },
        { status: 400 },
      );
    }

    await upsertTrelloToken({ shop: session.shop, token });

    return jsonWithCors({ ok: true, intent });
  }

  const trelloRecord = await getTrelloConfigForShop(session.shop);

  if (!trelloRecord || !trelloRecord.token) {
    return jsonWithCors(
      {
        ok: false,
        intent,
        error: "Connect Trello before continuing.",
      },
      { status: 400 },
    );
  }

  const authConfig = {
    apiKey: baseConfig.apiKey,
    token: trelloRecord.token,
  };

  if (intent === "fetchBoards") {
    try {
      const boards = await fetchMemberBoards(authConfig);

      return jsonWithCors({
        ok: true,
        intent,
        boards: boards.map((board) => ({ id: board.id, name: board.name })),
      });
    } catch (error) {
      if (isHtmlErrorDetails(error)) {
        return jsonWithCors(
          {
            ok: false,
            intent,
            error:
              "Your Trello session expired. Reconnect Trello to continue.",
            requiresReauth: true,
          },
          { status: 401 },
        );
      }

      if (error instanceof TrelloRequestError) {
        return jsonWithCors(
          {
            ok: false,
            intent,
            error: error.message,
            details: error.details,
          },
          { status: 502 },
        );
      }

      throw error;
    }
  }

  if (intent === "fetchLists") {
    const boardId = formData.get("boardId")?.toString().trim();

    if (!boardId) {
      return jsonWithCors(
        { ok: false, intent, error: "Board ID is required." },
        { status: 400 },
      );
    }

    try {
      const lists = await fetchBoardLists(authConfig, boardId);

      return jsonWithCors({
        ok: true,
        intent,
        lists: lists.map((list) => ({ id: list.id, name: list.name })),
      });
    } catch (error) {
      if (isHtmlErrorDetails(error)) {
        return jsonWithCors(
          {
            ok: false,
            intent,
            error:
              "Your Trello session expired. Reconnect Trello to continue.",
            requiresReauth: true,
          },
          { status: 401 },
        );
      }

      if (error instanceof TrelloRequestError) {
        return jsonWithCors(
          {
            ok: false,
            intent,
            error: error.message,
            details: error.details,
          },
          { status: 502 },
        );
      }

      throw error;
    }
  }

  if (intent === "saveSelection") {
    const boardId = formData.get("boardId")?.toString().trim();
    const listId = formData.get("listId")?.toString().trim();

    if (!boardId || !listId) {
      return jsonWithCors(
        {
          ok: false,
          intent,
          error: "Select both a Trello board and list.",
        },
        { status: 400 },
      );
    }

    try {
      const boards = await fetchMemberBoards(authConfig);
      const board = boards.find((entry) => entry.id === boardId);

      if (!board) {
        return jsonWithCors(
          {
            ok: false,
            intent,
            error: "Board is no longer available in Trello.",
          },
          { status: 404 },
        );
      }

      const lists = await fetchBoardLists(authConfig, boardId);
      const list = lists.find((entry) => entry.id === listId);

      if (!list) {
        return jsonWithCors(
          {
            ok: false,
            intent,
            error: "List is no longer available in Trello.",
          },
          { status: 404 },
        );
      }

      await updateTrelloSelection({
        shop: session.shop,
        boardId,
        boardName: board.name,
        listId,
        listName: list.name,
      });

      return jsonWithCors({
        ok: true,
        intent,
        board: { id: boardId, name: board.name },
        list: { id: listId, name: list.name },
      });
    } catch (error) {
      if (isHtmlErrorDetails(error)) {
        return jsonWithCors(
          {
            ok: false,
            intent,
            error:
              "Your Trello session expired. Reconnect Trello to continue.",
            requiresReauth: true,
          },
          { status: 401 },
        );
      }

      if (error instanceof TrelloRequestError) {
        return jsonWithCors(
          {
            ok: false,
            intent,
            error: error.message,
            details: error.details,
          },
          { status: 502 },
        );
      }

      throw error;
    }
  }

  const title = formData.get("title")?.toString().trim() || "";
  const description = formData.get("description")?.toString().trim() || "";
  const listIdInput = formData.get("listId")?.toString().trim() || "";
  const dueInput = formData.get("due")?.toString().trim() || "";
  const sourceUrl = formData.get("sourceUrl")?.toString().trim() || "";

  const listId = listIdInput || trelloRecord.listId || "";

  const errors = {};
  if (!title) {
    errors.title = "Card title is required.";
  }
  if (!listId) {
    errors.listId = "Select the Trello list that should receive this card.";
  }

  if (Object.keys(errors).length > 0) {
    return jsonWithCors({ ok: false, errors }, { status: 400 });
  }

  const due = dueInput ? new Date(dueInput).toISOString() : undefined;

  try {
    const card = await createCard(authConfig, {
      name: title,
      desc: description,
      listId,
      due,
      sourceUrl: sourceUrl || undefined,
    });

    return jsonWithCors({
      ok: true,
      card: {
        id: card.id,
        name: card.name,
        url: card.url,
        shortUrl: card.shortUrl,
        idList: card.idList,
      },
    });
  } catch (error) {
    if (isHtmlErrorDetails(error)) {
      return jsonWithCors(
        {
          ok: false,
          error:
            "Your Trello session expired. Reconnect Trello to continue.",
          requiresReauth: true,
          details: summarizeHtmlDetails(error.details),
        },
        { status: 401 },
      );
    }

    if (error instanceof TrelloRequestError) {
      return jsonWithCors(
        {
          ok: false,
          error:
            "Creating the Trello card failed. Check your Trello credentials and try again.",
          details: error.details,
        },
        { status: 502 },
      );
    }

    throw error;
  }
};

export default function Index() {
  const cardFetcher = useFetcher();
  const trelloFetcher = useFetcher();
  const shopify = useAppBridge();
  const formRef = useRef(null);
  const revalidator = useRevalidator();
  const handledTrelloReauth = useRef(new Set());
  const handledCardReauth = useRef(false);

  const {
    status,
    authorizeUrl,
    boards = [],
    lists = [],
    selectedBoardId,
    selectedListId,
    selectedBoardName,
    missingEnv = [],
    trelloError,
    trelloDetails,
    allowedOrigin,
  } = useLoaderData();

  const [currentBoardId, setCurrentBoardId] = useState(selectedBoardId || "");
  const [availableLists, setAvailableLists] = useState(lists);
  const [currentListId, setCurrentListId] = useState(selectedListId || "");
  const [overrideBoards, setOverrideBoards] = useState(null);

  const isCardSubmitting =
    ["loading", "submitting"].includes(cardFetcher.state) &&
    cardFetcher.formMethod === "POST";
  const connectIntent = trelloFetcher.formData?.get("intent")?.toString();
  const isConnectSubmitting =
    ["loading", "submitting"].includes(trelloFetcher.state) &&
    (connectIntent === "saveSelection" || connectIntent === "saveToken");

  useEffect(() => {
    setCurrentBoardId(selectedBoardId || "");
  }, [selectedBoardId]);

  useEffect(() => {
    setAvailableLists(lists);
    if (lists.length > 0 || boards.length > 0) {
      setOverrideBoards(null);
    }
  }, [lists, boards.length]);

  useEffect(() => {
    setCurrentListId(selectedListId || "");
  }, [selectedListId]);

  const requestReauth = useCallback((intent, message) => {
    if (!intent) {
      return;
    }

    if (handledTrelloReauth.current.has(intent)) {
      return;
    }

    handledTrelloReauth.current.add(intent);
    if (message) {
      shopify.toast.show(message, { isError: true });
    }
    revalidator.revalidate();
  }, [handledTrelloReauth, revalidator, shopify]);

  useEffect(() => {
    const result = trelloFetcher.data;
    if (!result?.intent) {
      return;
    }

    if (result.requiresReauth) {
      requestReauth(result.intent, result.error);
      return;
    }

    handledTrelloReauth.current.delete(result.intent);

    if (result.intent === "saveToken") {
      if (result.ok) {
        shopify.toast.show("Connected to Trello");
        setOverrideBoards(null);
        setAvailableLists([]);
        setCurrentBoardId("");
        setCurrentListId("");
        trelloFetcher.submit({ intent: "fetchBoards" }, { method: "post" });
      } else if (result.error) {
        shopify.toast.show(result.error, { isError: true });
      }
      return;
    }

    if (result.intent === "fetchBoards") {
      if (result.ok) {
        setOverrideBoards(result.boards);
      } else if (result.error) {
        shopify.toast.show(result.error, { isError: true });
      }
      return;
    }

    if (result.intent === "saveSelection") {
      if (result.ok) {
        shopify.toast.show("Default Trello list updated");
        revalidator.revalidate();
      } else if (result.error) {
        shopify.toast.show(result.error, { isError: true });
      }
      return;
    }

    if (result.intent === "fetchLists") {
      if (result.ok) {
        setAvailableLists(result.lists);
      } else if (result.error) {
        shopify.toast.show(result.error, { isError: true });
      }
    }
  }, [trelloFetcher, trelloFetcher.data, requestReauth, shopify, revalidator]);

  useEffect(() => {
    const result = cardFetcher.data;
    if (!result) {
      return;
    }

    if (result.requiresReauth) {
      if (!handledCardReauth.current) {
        handledCardReauth.current = true;
        shopify.toast.show(result.error, { isError: true });
        revalidator.revalidate();
      }
      return;
    }

    handledCardReauth.current = false;

    if (result.ok) {
      shopify.toast.show("Trello card created");
      formRef.current?.reset();
    } else if (result.error) {
      shopify.toast.show(result.error, { isError: true });
    }
  }, [cardFetcher, cardFetcher.data, shopify, revalidator]);

  useEffect(() => {
    if (!authorizeUrl) {
      return;
    }

    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (
        typeof event.data === "object" &&
        event.data !== null &&
        event.data.type === "trello-token" &&
        event.data.token
      ) {
        trelloFetcher.submit(
          { intent: "saveToken", token: event.data.token },
          { method: "post" },
        );
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [authorizeUrl, trelloFetcher]);

  const connectToTrello = () => {
    if (!authorizeUrl) {
      return;
    }

    window.open(
      authorizeUrl,
      "trelloAuthorize",
      "toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=600,height=700",
    );
  };

  const boardsSource = overrideBoards ?? boards;
  const boardOptions = useMemo(
    () =>
      boardsSource.map((board) => ({ value: board.id, label: board.name })),
    [boardsSource],
  );
  const listOptions = useMemo(
    () =>
      availableLists.map((list) => ({ value: list.id, label: list.name })),
    [availableLists],
  );

  const effectiveStatus =
    status === "needs_token" && overrideBoards !== null
      ? "needs_selection"
      : status;

  return (
    <s-page heading="Create Trello ticket">
      {effectiveStatus === "missing_env" && (
        <s-section heading="Configuration required">
          <s-paragraph>
            Add your Trello credentials to the app environment before creating
            cards.
          </s-paragraph>
          {missingEnv?.length > 0 && (
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <strong>Missing variables:</strong>{" "}
              {missingEnv.map((item) => item).join(", ")}
            </s-box>
          )}
        </s-section>
      )}

      {effectiveStatus === "needs_token" && (
        <s-section heading="Connect Trello">
          <s-paragraph>
            Link your Shopify store to Trello once, and we&apos;ll automatically
            pull your boards and lists for future sessions.
          </s-paragraph>
          {trelloError && (
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
              style={{ marginBottom: "16px" }}
            >
              <div>{trelloError}</div>
              {trelloDetails && (
                <div style={{ marginTop: "8px", fontSize: "0.9em" }}>
                  {trelloDetails}
                </div>
              )}
            </s-box>
          )}
          <s-button
            onClick={connectToTrello}
            {...(isConnectSubmitting ? { loading: true } : {})}
          >
            Connect to Trello
          </s-button>
          {allowedOrigin && (
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
              style={{ marginTop: "16px", display: "grid", gap: "8px" }}
            >
              <strong>Add this origin to Trello&apos;s Allowed Origins:</strong>
              <code>{allowedOrigin}</code>
              <s-paragraph style={{ margin: 0 }}>
                Visit{" "}
                <s-link href="https://trello.com/app-key" target="_blank">
                  trello.com/app-key
                </s-link>{" "}
                and paste the value above into <em>Allowed Origins</em>. Update
                it whenever your development tunnel URL changes.
              </s-paragraph>
            </s-box>
          )}
        </s-section>
      )}

      {status === "token_error" && (
        <s-section heading="Reconnect Trello">
          <s-paragraph>
            The Trello authorization failed. Sign in again to refresh the
            connection.
          </s-paragraph>
          {trelloError && (
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="critical-subdued"
            >
              <strong>Trello error:</strong> {trelloError}
              {trelloDetails && (
                <pre
                  style={{
                    marginTop: "var(--p-space-3)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {typeof trelloDetails === "string"
                    ? trelloDetails
                    : JSON.stringify(trelloDetails, null, 2)}
                </pre>
              )}
            </s-box>
          )}
          <s-button onClick={connectToTrello}>Reconnect Trello</s-button>
          {allowedOrigin && (
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
              style={{ marginTop: "16px", display: "grid", gap: "8px" }}
            >
              <strong>Verify Trello&apos;s Allowed Origins:</strong>
              <code>{allowedOrigin}</code>
              <s-paragraph style={{ margin: 0 }}>
                The Trello authorization popup must redirect back to this
                origin. Add or update it under <em>Allowed Origins</em> on{" "}
                <s-link href="https://trello.com/app-key" target="_blank">
                  trello.com/app-key
                </s-link>
                .
              </s-paragraph>
            </s-box>
          )}
        </s-section>
      )}

      {effectiveStatus === "needs_selection" && (
        <s-section heading="Choose the default board and list">
          <s-paragraph>
            Decide which Trello list should receive new Shopify tickets. You can
            update this preference any time.
          </s-paragraph>
          {boardOptions.length === 0 && (
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
              style={{ marginBottom: "16px" }}
            >
              No Trello boards found for your account. Confirm the Trello user
              you authorized has access to at least one board.
            </s-box>
          )}
          <trelloFetcher.Form method="post" style={{ maxWidth: "420px" }}>
            <input type="hidden" name="intent" value="saveSelection" />
            <div style={{ display: "grid", gap: "6px", marginBottom: "16px" }}>
              <label htmlFor="boardId">
                <strong>Board</strong>
              </label>
              <select
                id="boardId"
                name="boardId"
                required
                value={currentBoardId}
                onChange={(event) => {
                  const nextBoardId = event.target.value;
                  setCurrentBoardId(nextBoardId);
                  setCurrentListId("");

                  if (nextBoardId) {
                    trelloFetcher.submit(
                      { intent: "fetchLists", boardId: nextBoardId },
                      { method: "post" },
                    );
                  } else {
                    setAvailableLists([]);
                  }
                }}
              >
                <option value="">Select a board</option>
                {boardOptions.map((board) => (
                  <option key={board.value} value={board.value}>
                    {board.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gap: "6px", marginBottom: "16px" }}>
              <label htmlFor="listId">
                <strong>List</strong>
              </label>
              <select
                id="listId"
                name="listId"
                required
                value={currentListId}
                onChange={(event) => setCurrentListId(event.target.value)}
                disabled={!currentBoardId || listOptions.length === 0}
              >
                <option value="">Select a list</option>
                {listOptions.map((list) => (
                  <option key={list.value} value={list.value}>
                    {list.label}
                  </option>
                ))}
              </select>
            </div>

            <s-button
              type="submit"
              {...(isConnectSubmitting ? { loading: true } : {})}
            >
              Save
            </s-button>
          </trelloFetcher.Form>
        </s-section>
      )}

      {effectiveStatus === "ready" && (
        <s-section heading="Ticket details">
          <s-paragraph>
            Submit the form to create a Trello card without leaving the Shopify
            admin.
          </s-paragraph>
          <cardFetcher.Form
            method="post"
            ref={formRef}
            style={{
              display: "grid",
              gap: "var(--p-space-5, 20px)",
              maxWidth: "480px",
            }}
          >
            <div style={{ display: "grid", gap: "6px" }}>
              <label htmlFor="title">
                <strong>Title</strong>
              </label>
              <input
                id="title"
                name="title"
                placeholder="What needs to be done?"
                required
              />
              {cardFetcher.data?.errors?.title && (
                <span style={{ color: "var(--p-color-text-critical)" }}>
                  {cardFetcher.data.errors.title}
                </span>
              )}
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <label htmlFor="description">
                <strong>Description</strong>
              </label>
              <textarea
                id="description"
                name="description"
                placeholder="Provide context for your teammates"
                rows={5}
              />
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <label htmlFor="listId">
                <strong>List</strong>
                {selectedBoardName && (
                  <span style={{ marginLeft: "8px", color: "#637381" }}>
                    ({selectedBoardName})
                  </span>
                )}
              </label>
              <select
                id="listId"
                name="listId"
                defaultValue={selectedListId || ""}
              >
                <option value="">Select a list</option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
              {cardFetcher.data?.errors?.listId && (
                <span style={{ color: "var(--p-color-text-critical)" }}>
                  {cardFetcher.data.errors.listId}
                </span>
              )}
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <label htmlFor="due">
                <strong>Due date</strong>
              </label>
              <input id="due" name="due" type="datetime-local" />
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <label htmlFor="sourceUrl">
                <strong>Attachment URL</strong>
              </label>
              <input
                id="sourceUrl"
                name="sourceUrl"
                placeholder="Link a Shopify resource or reference"
                type="url"
              />
            </div>

            <s-stack direction="inline" gap="base">
              <s-button
                type="submit"
                {...(isCardSubmitting ? { loading: true } : {})}
              >
                Create Trello card
              </s-button>
              <s-button
                type="reset"
                variant="tertiary"
                onClick={() => formRef.current?.reset()}
              >
                Reset
              </s-button>
            </s-stack>
          </cardFetcher.Form>
        </s-section>
      )}

      {cardFetcher.data?.ok && cardFetcher.data?.card && (
        <s-section heading="Latest Trello card">
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
            style={{ display: "grid", gap: "8px" }}
          >
            <div>
              <strong>{cardFetcher.data.card.name}</strong>
            </div>
            <div>
              <s-link href={cardFetcher.data.card.shortUrl} target="_blank">
                Open card in Trello
              </s-link>
            </div>
          </s-box>
        </s-section>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
