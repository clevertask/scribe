/* oxlint-disable react/only-export-components */

import "@radix-ui/themes/styles.css";
import "@clevertask/scribe/styles.css";

import { Scribe } from "@clevertask/scribe";
import { Theme } from "@radix-ui/themes";
import { Extension } from "@tiptap/core";
import { EditorState, Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

const ConsumerDecoration = Extension.create({
  name: "consumerDecoration",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        view(editorView) {
          editorView.dom.dataset.consumerEditorViewIdentity = String(
            editorView instanceof EditorView,
          );
          editorView.dom.dataset.consumerEditorStateIdentity = String(
            editorView.state instanceof EditorState,
          );

          return {};
        },
        props: {
          decorations(state) {
            const widget = document.createElement("span");
            const documentText = state.doc.textContent || "empty document";

            widget.dataset.testid = "consumer-decoration";
            widget.textContent = `Consumer decoration: ${documentText}`;

            return DecorationSet.create(state.doc, [Decoration.widget(1, widget)]);
          },
        },
      }),
    ];
  },
});

function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const mobile = searchParams.get("mobile") === "true";
  const showConsumerDecoration = searchParams.get("consumerDecoration") === "true";
  const [serializedHtml, setSerializedHtml] = useState("");

  return (
    <Theme>
      <main style={{ margin: "2rem auto", maxWidth: "64rem", padding: "0 1rem" }}>
        <Scribe
          ariaLabel="Document content"
          content={showConsumerDecoration ? "" : "<p>Package consumer content</p>"}
          extensions={showConsumerDecoration ? [ConsumerDecoration] : undefined}
          mobile={mobile}
          onContentChange={
            showConsumerDecoration
              ? ({ htmlContent }) => {
                  setSerializedHtml(htmlContent);
                }
              : undefined
          }
          placeholderText={showConsumerDecoration ? "Consumer placeholder" : undefined}
        />
        {showConsumerDecoration ? (
          <output data-testid="serialized-html" hidden>
            {serializedHtml}
          </output>
        ) : null}
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
