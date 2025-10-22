export default function AdditionalPage() {
  return (
    <s-page heading="Setup guide">
      <s-section heading="Connect Trello">
        <s-paragraph>
          Store your Trello credentials in the app environment so the ticket
          form can authenticate with Trello on behalf of your workspace.
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>
            Generate an API key at{" "}
            <s-link href="https://trello.com/app-key" target="_blank">
              trello.com/app-key
            </s-link>{" "}
            and copy the value into <code>TRELLO_API_KEY</code>.
          </s-list-item>
          <s-list-item>
            On the same page, click the token link and authorize the app. Store
            the result in <code>TRELLO_API_TOKEN</code>.
          </s-list-item>
          <s-list-item>
            Open the Trello board you want to target, copy the board ID from the
            URL, and set <code>TRELLO_BOARD_ID</code>.
          </s-list-item>
          <s-list-item>
            Optionally pick a default list ID from that board and set{" "}
            <code>TRELLO_LIST_ID</code>. Merchants can still choose a different
            list at submission time.
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section heading="Form behaviour">
        <s-paragraph>
          The Shopify admin page reads the values above through environment
          variables, so you never expose Trello secrets in the browser. Card
          titles are required, descriptions and due dates are optional, and you
          can attach any URL (for example, an order or customer link) to the
          card automatically.
        </s-paragraph>
        <s-paragraph>
          If the configuration is missing or the Trello API rejects a request,
          the app surfaces the error and keeps the form data in place so you can
          try again quickly.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Next steps">
        <s-unordered-list>
          <s-list-item>
            <s-link
              href="https://developer.atlassian.com/cloud/trello/rest/api-group-cards/"
              target="_blank"
            >
              Trello cards API reference
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link
              href="https://shopify.dev/docs/apps/getting-started/app-templates"
              target="_blank"
            >
              Shopify app deployment guides
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}
