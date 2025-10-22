import { useEffect } from "react";

export default function TrelloCallback() {
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const token = params.get("token");

    if (token) {
      window.opener?.postMessage(
        { type: "trello-token", token },
        window.location.origin,
      );
    }

    window.close();
  }, []);

  return (
    <div
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div>
        <h1>Authorizing Trello…</h1>
        <p>If this window does not close automatically, you can close it now.</p>
      </div>
    </div>
  );
}
