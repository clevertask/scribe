import "@radix-ui/themes/styles.css";
import "../lib/styles/main.css";
import { Theme } from "@radix-ui/themes";
import { useRef, useState } from "react";
import { Scribe, ScribeRef, ScribeTableOfContentsItem } from "../lib/main";

const demoContent = `
  <h1>Math fundamentals</h1>
  <p>Start with a short note about the document.</p>
  <h2>Linear equations</h2>
  <p>Keep related examples close to the heading.</p>
  <h2>Quadratic equations</h2>
  <p>Practice steps can live under each section.</p>
  <h3>Factoring</h3>
  <p>A smaller section still appears nested in the table of contents.</p>
`;

const ChatBox = function ChatBox() {
  const editor = useRef<ScribeRef>(null);
  const [tableOfContentsItems, setTableOfContentsItems] = useState<ScribeTableOfContentsItem[]>([]);
  const [tableOfContentsOpen, setTableOfContentsOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <Scribe
        ref={editor}
        content={demoContent}
        enableTableOfContents
        onContentChange={(c) => console.log(c)}
        onTableOfContentsChange={(items) => setTableOfContentsItems(items)}
        placeholderText="Type your message..."
        editorContentStyle={{ maxHeight: "200px", overflowY: "scroll" }}
      />

      {tableOfContentsItems.length > 0 ? (
        <div style={{ position: "absolute", right: "12px", top: "12px", zIndex: 1 }}>
          <button
            type="button"
            onClick={() => setTableOfContentsOpen((isOpen) => !isOpen)}
            style={{
              background: "var(--accent-9)",
              border: 0,
              borderRadius: "8px",
              color: "white",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 600,
              padding: "6px 10px",
            }}
          >
            Outline
          </button>

          {tableOfContentsOpen ? (
            <div
              style={{
                background: "var(--color-panel-solid)",
                border: "1px solid var(--gray-6)",
                borderRadius: "8px",
                boxShadow: "0 16px 32px -24px rgba(15, 23, 42, 0.55)",
                marginTop: "6px",
                maxWidth: "240px",
                minWidth: "200px",
                padding: "6px",
              }}
            >
              {tableOfContentsItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    editor.current?.scrollToTableOfContentsItem(item);
                    setTableOfContentsOpen(false);
                  }}
                  style={{
                    background: item.isActive ? "var(--accent-a3)" : "transparent",
                    border: 0,
                    borderRadius: "6px",
                    color: "var(--gray-12)",
                    cursor: "pointer",
                    display: "block",
                    fontSize: "13px",
                    fontWeight: item.isActive ? 600 : 400,
                    overflow: "hidden",
                    padding: "7px 8px",
                    paddingLeft: `${8 + (item.level - 1) * 12}px`,
                    textAlign: "left",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    width: "100%",
                  }}
                >
                  {item.textContent}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

function App() {
  return (
    <Theme appearance="light" panelBackground="solid">
      <div style={{ margin: "auto", maxWidth: "720px" }}>
        <ChatBox />
      </div>
    </Theme>
  );
}

export default App;
