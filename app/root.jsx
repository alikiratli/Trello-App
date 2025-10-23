import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        {/* Block Shopify analytics endpoint that spams monorail-edge */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                const blocked = "https://monorail-edge.shopifysvc.com/unstable/produce_batch";
                const extractUrl = (value) => {
                  if (typeof value === "string") return value;
                  if (value && typeof value.href === "string") return value.href;
                  if (value && typeof value.url === "string") return value.url;
                  return null;
                };

                const originalFetch = window.fetch;
                if (typeof originalFetch === "function") {
                  window.fetch = function patchedFetch(resource, init) {
                    const url = extractUrl(resource);
                    if (url && url.startsWith(blocked)) {
                      return Promise.resolve(new Response(null, { status: 204 }));
                    }
                    return originalFetch.apply(this, arguments);
                  };
                }

                const nav = window.navigator;
                if (nav && typeof nav.sendBeacon === "function") {
                  const originalBeacon = nav.sendBeacon.bind(nav);
                  nav.sendBeacon = function patchedBeacon(url, data) {
                    const target = typeof url === "string" ? url : extractUrl(url);
                    if (target && target.startsWith(blocked)) {
                      return true;
                    }
                    return originalBeacon(url, data);
                  };
                }
              })();
            `,
          }}
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
