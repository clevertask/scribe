/* oxlint-disable react/only-export-components */

import "@radix-ui/themes/styles.css";
import "@clevertask/scribe/styles.css";

import { Scribe } from "@clevertask/scribe";
import { Theme } from "@radix-ui/themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function App() {
  const mobile = new URLSearchParams(window.location.search).get("mobile") === "true";

  return (
    <Theme>
      <main style={{ margin: "2rem auto", maxWidth: "64rem", padding: "0 1rem" }}>
        <Scribe
          ariaLabel="Document content"
          content="<p>Package consumer content</p>"
          mobile={mobile}
        />
      </main>
    </Theme>
  );
}

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} else {
  console.error("Root element not found");
}
