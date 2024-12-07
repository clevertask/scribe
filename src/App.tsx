import "../lib/styles/main.css";
import { useState, useEffect, useRef } from "react";
import { Scribe, ScribeRef } from "../lib/main";
import { streamedContent } from "./data";

function App() {
  const editor = useRef<ScribeRef>(null);
  const [editable, setEditable] = useState(true);
  const [content, setContent] = useState("");

  useEffect(() => {
    let currentContent = "";

    const intervalId = setInterval(() => {
      const nextChunk = streamedContent.substring(currentContent.length, currentContent.length + 10);
      if (nextChunk) {
        currentContent += nextChunk;
        setContent(currentContent);
      } else {
        clearInterval(intervalId);
      }
    }, 100);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div style={{ maxWidth: "720px", margin: "auto" }}>
      <Scribe content={content} showBarMenu={false} editable={false} />

      <div style={{ position: "fixed", bottom: "5%", left: 0, right: 0 }}>
        <Scribe
          ref={editor}
          onContentChange={(c) => console.log(c)}
          editable={editable}
          showBarMenu={editable}
          placeholderText="Type your message..."
          editorContentStyle={{ maxHeight: "200px", overflowY: "scroll" }}
          mainContainerStyle={{ maxWidth: "620px", margin: "auto" }}
        />
        <div style={{ display: "flex", flexFlow: "column", gap: "1rem" }}>
          <button onClick={() => setEditable((e) => !e)} style={{ backgroundColor: "coral" }}>
            Toggle editable
          </button>

          <button onClick={() => setContent("Hello world...")} style={{ backgroundColor: "olive" }}>
            Change content
          </button>

          <button onClick={() => editor.current?.resetContent()} style={{ backgroundColor: "olive" }}>
            Reset content
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
