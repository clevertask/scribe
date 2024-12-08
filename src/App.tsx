import "../lib/styles/main.css";
import { useState, useEffect, useRef } from "react";
import { Scribe, ScribeRef } from "../lib/main";
import { streamedContent } from "./data";

const Messages = function Messages() {
  const [content, setContent] = useState("");
  useEffect(() => {
    let currentContent = "";

    const intervalId = setInterval(() => {
      const nextChunk = streamedContent.substring(
        currentContent.length,
        currentContent.length + 10,
      );
      if (nextChunk) {
        currentContent += nextChunk;
        setContent(currentContent);
      } else {
        clearInterval(intervalId);
      }
    }, 100);

    return () => clearInterval(intervalId);
  }, []);

  return <Scribe content={content} showBarMenu={false} editable={false} />;
};

const ChatBox = function ChatBox() {
  const editor = useRef<ScribeRef>(null);
  return (
    <>
      <Scribe
        ref={editor}
        onContentChange={(c) => console.log(c)}
        placeholderText="Type your message..."
        editorContentStyle={{ maxHeight: "200px", overflowY: "scroll" }}
      />
    </>
  );
};

function App() {
  return (
    <div style={{ maxWidth: "720px", margin: "auto" }}>
      <Messages />
      <ChatBox />
    </div>
  );
}

export default App;
