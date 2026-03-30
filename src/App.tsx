import "@radix-ui/themes/styles.css";
import "../lib/styles/main.css";
import { Theme } from "@radix-ui/themes";
import { useRef } from "react";
import { Scribe, ScribeRef } from "../lib/main";

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
    <Theme appearance="light" panelBackground="solid">
      <div style={{ margin: "auto", maxWidth: "720px" }}>
        <ChatBox />
      </div>
    </Theme>
  );
}

export default App;
