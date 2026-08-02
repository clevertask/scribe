/* oxlint-disable react/only-export-components */

import "@radix-ui/themes/styles.css";
import "@clevertask/scribe/styles.css";

import { Scribe } from "@clevertask/scribe";
import { Theme } from "@radix-ui/themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function App() {
  return (
    <Theme>
      <main style={{ margin: "2rem auto", maxWidth: "64rem", padding: "0 1rem" }}>
        <Scribe ariaLabel="Document content" content="<p>Package consumer content</p>" />
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
