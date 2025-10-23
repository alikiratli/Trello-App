import { useEffect, useState } from "react";

const RETURN_PATH_KEY = "trello:returnPath";

export default function TrelloCallback() {
  const [statusMessage, setStatusMessage] = useState("Authorizing Trello…");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const token = params.get("token");

    if (token) {
      const redirectToStoredPath = (delay = 0) => {
        let storedPath = null;
        try {
          storedPath = window.sessionStorage?.getItem(RETURN_PATH_KEY) || null;
          window.sessionStorage?.removeItem(RETURN_PATH_KEY);
        } catch (_error) {
          // Ignore storage access issues and fall back to default redirect
        }

        const fallbackUrl = new URL("/app", window.location.origin).toString();
        const destination = storedPath || fallbackUrl;

        const performRedirect = () => {
          window.location.replace(destination);
        };

        if (delay > 0) {
          setTimeout(performRedirect, delay);
        } else {
          performRedirect();
        }
      };

      window.opener?.postMessage({ type: "trello-token", token }, "*");
      if (window.opener) {
        window.close();
        return;
      }

      setStatusMessage("Connecting Trello to your shop…");
      const formData = new FormData();
      formData.set("intent", "saveToken");
      formData.set("token", token);

      fetch("/app", {
        method: "post",
        body: formData,
        credentials: "include",
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("Failed to persist Trello token");
          }
          setStatusMessage("Trello connected. Redirecting…");
          redirectToStoredPath(300);
        })
        .catch((error) => {
          console.error(error);
          setErrorMessage(
            "We could not save the Trello token automatically. Return to the app and try again.",
          );
          setStatusMessage("Authorization complete.");
        });
    } else {
      setStatusMessage("Missing Trello token. You can close this window.");
    }
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
        <h1>{statusMessage}</h1>
        <p>
          {errorMessage
            ? errorMessage
            : "If this window does not close automatically, you can close it now."}
        </p>
      </div>
    </div>
  );
}
