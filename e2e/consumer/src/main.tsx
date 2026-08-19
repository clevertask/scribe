/* oxlint-disable react/only-export-components */

import "@radix-ui/themes/styles.css";
import "@clevertask/scribe/styles.css";

import { Scribe, type ExternalLinkPreviewResolver } from "@clevertask/scribe";
import { Theme } from "@radix-ui/themes";
import { Extension } from "@tiptap/core";
import { EditorState, Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import { StrictMode, useCallback, useState } from "react";
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

const tableFixture = `
  <table>
    <thead>
      <tr>
        <th><p>Project</p></th>
        <th><p>Owner</p></th>
        <th><p>Status</p></th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><p>Scribe tables</p></td>
        <td><p>Gonzalo</p></td>
        <td><p>Planned</p></td>
      </tr>
    </tbody>
  </table>
  <p>Content after the table</p>
`;

const calloutFixture = `
  <p>Content before the callout</p>
  <aside data-type="callout" data-variant="warning">
    <p>Review the deployment settings before continuing.</p>
    <ul><li><p>Confirm the target environment</p></li></ul>
  </aside>
  <p>Content after the callout</p>
`;

const waitForPreviewResolution = (signal: AbortSignal, delay: number) =>
  new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, delay);
    const handleAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("The preview request was cancelled.", "AbortError"));
    };

    signal.addEventListener("abort", handleAbort, { once: true });
  });

const getLinkPreviewMetadata = (href: string) => {
  const url = new URL(href);

  if (url.pathname.includes("lucid-serum")) {
    return {
      pageTitle: "Lucid Serum",
      description: "An ambient preset collection saved for later.",
      siteName: "Example Sounds",
      faviconUrl: "/link-preview-assets/example-sounds-icon.svg",
      imageUrl: "/link-preview-assets/lucid-serum.svg",
      fetchedAt: "2026-08-19T12:05:00.000Z",
    };
  }

  return {
    pageTitle: "Edward Jacket",
    description: "A navy wool jacket saved for later.",
    siteName: "Example Store",
    faviconUrl: "/link-preview-assets/example-store-icon.svg",
    imageUrl: "/link-preview-assets/edward-jacket.svg",
    fetchedAt: "2026-08-19T12:00:00.000Z",
  };
};

function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const mobile = searchParams.get("mobile") === "true";
  const showConsumerDecoration = searchParams.get("consumerDecoration") === "true";
  const showCalloutFixture = searchParams.get("callout") === "true";
  const showExternalLinkPreviewFixture = searchParams.get("linkPreview") === "true";
  const showExternalLinkPreviewListFixture = searchParams.get("linkPreviewList") === "true";
  const showTableFixture = searchParams.get("table") === "true";
  const testEditableTransition = searchParams.get("editableTransition") === "true";
  const testNarrowEditor = searchParams.get("narrowEditor") === "true";
  const testNestedScroll = searchParams.get("nestedScroll") === "true";
  const testSlowLinkPreview = searchParams.get("slowLinkPreview") === "true";
  const testWindowScroll = searchParams.get("windowScroll") === "true";
  const [editable, setEditable] = useState(!testEditableTransition);
  const [serializedHtml, setSerializedHtml] = useState("");
  const [previewRequests, setPreviewRequests] = useState<string[]>([]);
  const resolveExternalLinkPreview = useCallback<ExternalLinkPreviewResolver>(
    async (href, { signal }) => {
      if (signal.aborted) {
        throw new DOMException("The preview request was cancelled.", "AbortError");
      }

      setPreviewRequests((requests) => [...requests, href]);

      if (testSlowLinkPreview) {
        await waitForPreviewResolution(signal, 300);
      }

      return getLinkPreviewMetadata(href);
    },
    [testSlowLinkPreview],
  );
  const scribe = (
    <div
      data-testid="scribe-container"
      style={testNarrowEditor ? { maxWidth: "18rem" } : undefined}
    >
      <Scribe
        ariaLabel="Document content"
        content={
          showConsumerDecoration
            ? ""
            : showExternalLinkPreviewListFixture
              ? "<ul><li><p></p></li></ul>"
              : showCalloutFixture
                ? calloutFixture
                : showTableFixture
                  ? tableFixture
                  : "<p>Package consumer content</p>"
        }
        editable={editable}
        externalLinkPreview={
          showExternalLinkPreviewFixture || showExternalLinkPreviewListFixture
            ? {
                resolve: resolveExternalLinkPreview,
                shouldPreview: (href) => new URL(href).hostname !== "clevertask.example",
              }
            : undefined
        }
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
    </div>
  );

  return (
    <Theme>
      <main style={{ margin: "2rem auto", maxWidth: "64rem", padding: "0 1rem" }}>
        {testWindowScroll ? <div aria-hidden style={{ height: "38rem" }} /> : null}
        {testEditableTransition ? (
          <button type="button" onClick={() => setEditable((current) => !current)}>
            {editable ? "Disable editing" : "Enable editing"}
          </button>
        ) : null}
        {showCalloutFixture || showExternalLinkPreviewFixture || showTableFixture ? (
          <button type="button">Outside focus target</button>
        ) : null}
        {testNestedScroll ? (
          <div data-testid="nested-scroll-container" style={{ height: "24rem", overflowY: "auto" }}>
            <div aria-hidden style={{ height: "20rem" }} />
            {scribe}
            <div aria-hidden style={{ height: "20rem" }} />
          </div>
        ) : (
          scribe
        )}
        {testWindowScroll ? <div aria-hidden style={{ height: "50rem" }} /> : null}
        {showConsumerDecoration ? (
          <output data-testid="serialized-html" hidden>
            {serializedHtml}
          </output>
        ) : null}
        {showExternalLinkPreviewFixture || showExternalLinkPreviewListFixture ? (
          <output data-testid="preview-requests" hidden>
            {JSON.stringify(previewRequests)}
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
