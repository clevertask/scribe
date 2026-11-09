import { Scribe, type ScribeReadOnlyTaskItemCheck, type ScribeRef } from "@clevertask/scribe";
import { Theme } from "@radix-ui/themes";
import { useRef, useState } from "react";

const content = `<ul data-type="taskList">
  <li data-type="taskItem" data-checked="false"><p>Same</p></li>
  <li data-type="taskItem" data-checked="false"><p>Same</p>
    <ul data-type="taskList">
      <li data-type="taskItem" data-checked="false"><p>Same</p></li>
    </ul>
  </li>
</ul>`;

export function ReadOnlyTaskItemsFixture({ mode }: { mode: string }) {
  const ref = useRef<ScribeRef>(null);
  const [allowed, setAllowed] = useState(mode !== "default");
  const [disabled, setDisabled] = useState(mode === "disabled");
  const [changes, setChanges] = useState<ScribeReadOnlyTaskItemCheck[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [editorFocusCount, setEditorFocusCount] = useState(0);

  return (
    <Theme>
      <main style={{ margin: "2rem auto", maxWidth: "40rem", padding: "0 1rem" }}>
        <button type="button" onClick={() => setAllowed((value) => !value)}>
          {allowed ? "Revoke checkbox changes" : "Allow checkbox changes"}
        </button>
        <button type="button" onClick={() => setDisabled((value) => !value)}>
          {disabled ? "Resume checkbox changes" : "Pause checkbox changes"}
        </button>
        <button type="button" onClick={() => ref.current?.setContent(content)}>
          Restore canonical content
        </button>
        <button type="button">Before checklist</button>
        <div
          onFocusCapture={(event) => {
            if ((event.target as HTMLElement).classList.contains("ProseMirror")) {
              setEditorFocusCount((count) => count + 1);
            }
          }}
        >
          <Scribe
            ref={ref}
            content={content}
            ariaLabel="Read-only checklist"
            editable={false}
            showBarMenu={false}
            readOnlyTaskItemChecks={
              allowed
                ? { disabled, onChange: (change) => setChanges((events) => [...events, change]) }
                : undefined
            }
            onContentChange={({ source }) => setSources((events) => [...events, source])}
          />
        </div>
        <button type="button">After checklist</button>
        <output data-testid="checkbox-actions" hidden>
          {JSON.stringify(changes)}
        </output>
        <output data-testid="content-change-sources" hidden>
          {JSON.stringify(sources)}
        </output>
        <output data-testid="editor-focus-count" hidden>
          {editorFocusCount}
        </output>
      </main>
    </Theme>
  );
}
