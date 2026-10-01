/* oxlint-disable react/only-export-components */

import "@radix-ui/themes/styles.css";
import "@clevertask/scribe/styles.css";

import { Scribe, type ExternalLinkPreviewResolver, type ScribeRef } from "@clevertask/scribe";
import { Theme } from "@radix-ui/themes";
import { Extension } from "@tiptap/core";
import { EditorState, Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import { StrictMode, useCallback, useRef, useState } from "react";
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

const tableLayoutFixture = `
  <p>Table layout example</p>
  <table><tbody>
    <tr><th colwidth="180"><p>Project</p></th><th><p>Owner</p></th><th><p>Status</p></th></tr>
    ${Array.from({ length: 20 }, (_, index) => `<tr><td colwidth="180"><p>Project ${index + 1}</p></td><td><p>Owner ${index + 1}</p></td><td><p>Planned ${index + 1}</p></td></tr>`).join("")}
  </tbody></table>
  <p>Independent table below</p>
  ${tableFixture}
`;

const tableStickyHeaderFixture = (limitHeight: boolean) => `
  <p>Sticky header example</p>
  <table data-table-layout="scroll" data-table-limit-height="${limitHeight}"><tbody>
    <tr><th colwidth="180"><p>Sticky project</p></th><th colwidth="180"><p>Owner</p><p>Accountable person</p></th><th colwidth="180"><p>Stage</p></th></tr>
    ${Array.from({ length: 20 }, (_, index) => `<tr><td colwidth="180"><p>Sticky project ${index + 1}</p></td><td colwidth="180"><p><strong>Owner ${index + 1}</strong></p></td><td colwidth="180"><p>Stage ${index + 1}</p></td></tr>`).join("")}
  </tbody></table>
  <p>Independent table below</p>
  ${tableFixture}
  <p>Merged cells example</p>
  <table data-table-layout="scroll" data-table-limit-height="true" data-table-sticky-header-row="true"><tbody>
    <tr><th colspan="2" colwidth="180,180"><p>Merged work</p></th><th colwidth="180"><p>Phase</p></th></tr>
    <tr><td rowspan="2" colwidth="180"><p>Shared owner</p></td><td colwidth="180"><p>Merged task 1</p></td><td colwidth="180"><p>Phase 1</p></td></tr>
    <tr><td colwidth="180"><p>Merged task 2</p></td><td colwidth="180"><p>Phase 2</p></td></tr>
    ${Array.from({ length: 18 }, (_, index) => `<tr><td colwidth="180"><p>Merged owner ${index + 3}</p></td><td colwidth="180"><p>Merged task ${index + 3}</p></td><td colwidth="180"><p>Phase ${index + 3}</p></td></tr>`).join("")}
  </tbody></table>
  <p>Content after the sticky tables</p>
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
  const disableUndoRedo = searchParams.get("disableUndoRedo") === "true";
  const mobile = searchParams.get("mobile") === "true";
  const showConsumerDecoration = searchParams.get("consumerDecoration") === "true";
  const captureContent = searchParams.get("captureContent") === "true";
  const showCalloutFixture = searchParams.get("callout") === "true";
  const showExternalLinkPreviewFixture = searchParams.get("linkPreview") === "true";
  const showExternalLinkPreviewListFixture = searchParams.get("linkPreviewList") === "true";
  const showTableFixture = searchParams.get("table") === "true";
  const showTableLayoutFixture = searchParams.get("tableLayoutFixture") === "true";
  const showTableStickyHeaderFixture = searchParams.get("tableStickyHeaderFixture") === "true";
  const testUncappedStickyHeader = searchParams.get("uncappedStickyHeader") === "true";
  const testEditableTransition = searchParams.get("editableTransition") === "true";
  const testNarrowEditor = searchParams.get("narrowEditor") === "true";
  const testNestedScroll = searchParams.get("nestedScroll") === "true";
  const testSlowLinkPreview = searchParams.get("slowLinkPreview") === "true";
  const testWindowScroll = searchParams.get("windowScroll") === "true";
  const [editable, setEditable] = useState(!testEditableTransition);
  const [extensionNames, setExtensionNames] = useState<string[]>([]);
  const [serializedHtml, setSerializedHtml] = useState("");
  const [reloadedTableHtml, setReloadedTableHtml] = useState<string>();
  const [tableReloadCount, setTableReloadCount] = useState(0);
  const scribeRef = useRef<ScribeRef | null>(null);
  const [previewRequests, setPreviewRequests] = useState<string[]>([]);
  const captureScribeRef = useCallback((scribe: ScribeRef | null) => {
    scribeRef.current = scribe;
    if (scribe) {
      setExtensionNames(scribe.editor.extensionManager.extensions.map(({ name }) => name));
    }
  }, []);
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
        key={tableReloadCount}
        ref={captureScribeRef}
        ariaLabel="Document content"
        content={
          reloadedTableHtml ??
          (showTableStickyHeaderFixture
            ? tableStickyHeaderFixture(!testUncappedStickyHeader)
            : showTableLayoutFixture
              ? tableLayoutFixture
              : showConsumerDecoration
                ? ""
                : showExternalLinkPreviewListFixture
                  ? "<ul><li><p></p></li></ul>"
                  : showCalloutFixture
                    ? calloutFixture
                    : showTableFixture
                      ? tableFixture
                      : "<p>Package consumer content</p>")
        }
        editable={editable}
        {...(disableUndoRedo ? { enableUndoRedo: false } : {})}
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
          captureContent ||
          showConsumerDecoration ||
          showTableLayoutFixture ||
          showTableStickyHeaderFixture
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
        {showTableLayoutFixture || showTableStickyHeaderFixture ? (
          <button
            type="button"
            onClick={() => {
              const savedHtml = scribeRef.current?.editor.getHTML();
              if (savedHtml !== undefined) {
                setSerializedHtml(savedHtml);
                setReloadedTableHtml(savedHtml);
                setTableReloadCount((count) => count + 1);
              }
            }}
          >
            Reload saved table content
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
        {captureContent ||
        showConsumerDecoration ||
        showTableLayoutFixture ||
        showTableStickyHeaderFixture ? (
          <output data-testid="serialized-html" hidden>
            {serializedHtml}
          </output>
        ) : null}
        <output data-ready={extensionNames.length > 0} data-testid="extension-names" hidden>
          {JSON.stringify(extensionNames)}
        </output>
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
