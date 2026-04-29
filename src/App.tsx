import "@radix-ui/themes/styles.css";
import "../lib/styles/main.css";
import { Box, Button, Flex, Text, Theme } from "@radix-ui/themes";
import { useRef, useState } from "react";
import { Scribe, type ScribeRef, type ScribeTableOfContentsItem } from "../lib/main";
import { streamedContent } from "./data";

const ChatBox = function ChatBox() {
  const scribeRef = useRef<ScribeRef>(null);
  const [outlineItems, setOutlineItems] = useState<ScribeTableOfContentsItem[]>([]);

  return (
    <Flex align="start" gap="5">
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Scribe
          ref={scribeRef}
          content={streamedContent}
          enableTableOfContents
          onContentChange={(content) => console.log(content)}
          onTableOfContentsChange={setOutlineItems}
          placeholderText="Type your message..."
        />
      </Box>

      <Box
        style={{
          flex: "0 0 220px",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          position: "sticky",
          top: 16,
        }}
      >
        <Text as="div" size="2" weight="bold" mb="2">
          Outline
        </Text>
        <Flex direction="column" gap="1">
          {outlineItems.map((item) => (
            <Button
              key={item.id}
              color={item.isActive ? "blue" : "gray"}
              highContrast={item.isActive}
              onClick={() => scribeRef.current?.scrollToTableOfContentsItem(item)}
              style={{
                justifyContent: "flex-start",
                marginLeft: Math.max(item.level - 1, 0) * 12,
                textAlign: "left",
              }}
              variant={item.isActive ? "solid" : "ghost"}
            >
              {item.textContent}
            </Button>
          ))}
        </Flex>
      </Box>
    </Flex>
  );
};

function App() {
  return (
    <Theme appearance="light" panelBackground="solid">
      <div style={{ margin: "auto", maxWidth: "1040px", padding: "16px" }}>
        <ChatBox />
      </div>
    </Theme>
  );
}

export default App;
