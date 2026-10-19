# @clevertask/scribe

A versatile, block-based rich text editor for diverse applications, built with Tiptap and inspired by Notion's intuitive interface. `@clevertask/scribe` allows you to seamlessly view, create, and edit rich text content, with added support for Markdown parsing.

> [!WARNING]
> Scribe is experimental and has not reached version 1.0. Its APIs, default extensions, editor behavior, and built-in UI can change between releases, including minor releases. Pin an exact package version and test each upgrade before deployment. Forks and contributions are welcome.

## Features

- **Block-based Editing:** Enjoy a familiar and intuitive Notion-style editing experience.
- **Markdown Support:** Parse and render Markdown content effortlessly.
- **Markdown Paste:** Paste plain-text markdown into the editor and have it converted into rich content automatically.
- **Table Authoring:** Insert, resize, and edit tables with controls that stay next to the active table.
- **Ordinary Links:** Edit display text and URL with an accessible popover and native Tiptap paste behavior.
- **Versatile Integration:** Easily integrate `@clevertask/scribe` into any project requiring rich text editing.
- **View and Edit:** Seamlessly switch between viewing and editing modes.
- **Experimental Table of Contents:** Subscribe to heading changes and render an app-owned table of contents outside the editor.

## Table of Contents

- [@clevertask/scribe](#clevertaskscribe)
  - [Installation](#installation)
  - [Headless schema](#headless-schema)
  - [Usage](#usage)
  - [Table Authoring](#table-authoring)
  - [Links](#links)
  - [Experimental Table of Contents](#experimental-table-of-contents)
  - [Math Expressions](#math-expressions)
  - [Props](#props)
  - [Helper Functions](#helper-functions)
    - [md2html](#md2html)
    - [html2md](#html2md)
    - [convertLegacyMathDelimiters](#convertlegacymathdelimiters)
  - [Roadmap](#roadmap)
  - [Release Process](#release-process)
  - [License](#license)
  - [Credits](#credits)

## Installation

```bash
npm install --save-exact @clevertask/scribe @tiptap/pm@3.31.3
```

Scribe shares this exact ProseMirror runtime with consumer extensions. Keeping one
installed version prevents identity conflicts between built-in and custom plugins.

## Headless schema

Use the schema subpath when a server or migration tool must parse Scribe content without loading
the React editor or Scribe's stylesheet:

```bash
npm install --save-exact @clevertask/scribe @tiptap/core@3.31.3 @tiptap/html@3.31.3 @tiptap/pm@3.31.3
```

```ts
import { createScribeSchemaExtensions } from "@clevertask/scribe/schema";
import { generateJSON } from "@tiptap/html";

const extensions = createScribeSchemaExtensions({ enableUndoRedo: false });
const document = generateJSON(storedHtml, extensions);
```

The returned extensions define Scribe's persistent nodes and marks without loading Scribe's React
editor UI. Use them with Tiptap's server-side HTML utilities; this is not a headless interactive
editor. Scribe's menus, placeholders, suggestions, and table-of-contents behavior are not part of
this entry point. Consumer-owned nodes must be appended to the list. For example, an application
that stores its own resource-reference node must provide that extension before parsing or rendering
content containing those references.

Pin Scribe and Tiptap to the exact versions used by the writing clients. This entry point makes the
schema reusable; it does not make different schema versions interchangeable.

Scribe preserves inline code together with other text marks, such as bold and links. This applies
only to inline code; code-block text remains unmarked.

Servers can also inspect Scribe's document-node capabilities through the same headless entry:

```ts
import {
  createScribeDocumentNodeCapabilityManifest,
  createScribeSchemaExtensions,
} from "@clevertask/scribe/schema";
import { getSchema } from "@tiptap/core";

const extensions = createScribeSchemaExtensions({ enableUndoRedo: false });
const capabilities = createScribeDocumentNodeCapabilityManifest(getSchema(extensions));

capabilities.paragraph.potentialOperations; // [{ type: "replace_content" }]
capabilities.callout.potentialOperations; // [{ type: "set_attributes", attributes: ["variant"] }]
capabilities.taskItem.potentialOperations; // [{ type: "set_attributes", attributes: ["checked"] }]
capabilities.tableCell.potentialOperations; // []
```

The manifest intentionally keeps structural list changes application-owned. A consumer can use
the task-item attribute capability while defining its own bounded policy for adding or moving
task-list items.

These are structural possibilities, not application permissions. An application must still check
authorization, the current node and its ancestors, protected descendants, revision visibility,
parser support, and size limits before it offers or performs a write.

If an application appends a consumer-owned node to the Scribe schema, it must also pass an exact
capability declaration to `createScribeDocumentNodeCapabilityManifest`. Use
`defineScribeDocumentNodeCapability` to type that declaration. Manifest creation fails when a node
is missing, duplicated, or no longer matches the schema. A custom node can declare no potential
operations and remain explicitly read-only.

### Headless table transforms

The same headless entry can insert or delete an exact logical table row or column and can merge or
split cells without mounting an editor or accessing the DOM:

```ts
import { applyScribeTableTransform, createScribeSchemaExtensions } from "@clevertask/scribe/schema";
import { getSchema } from "@tiptap/core";

const schema = getSchema(createScribeSchemaExtensions({ enableUndoRedo: false }));
const document = schema.nodeFromJSON(storedDocument);
const tablePosition = 42; // ProseMirror position immediately before the table node.
const result = applyScribeTableTransform(document, tablePosition, {
  type: "insert_row",
  index: 1,
});

persist(result.document);
```

Rows and columns use zero-based logical coordinates from ProseMirror's table grid, not physical
child indexes. An insertion index may equal the current row or column count; deletion indexes must
name an existing logical row or column. Merge rectangles use half-open bounds: `topRow` and
`leftColumn` are included, while `bottomRowExclusive` and `rightColumnExclusive` are excluded. A
split's `row` and `column` must identify the merged cell's top-left logical coordinate. Existing
rowspans and colspans can therefore affect more than one physical cell even though the requested
logical boundary remains exact. The returned `before` and `after` geometry reports logical rows,
logical columns, and physical cell count.

`applyScribeTableTransform` is an immutable, exact-snapshot operation: it returns a new ProseMirror
document and leaves its input unchanged. It does not rebase coordinates or detect that another
writer changed the stored document after the input snapshot was read. On a concurrent change,
discard the candidate, read the latest document, resolve the intended table and coordinates again,
and rerun the transform. Invalid coordinates, malformed or nested tables, and operations that do
not apply throw `ScribeTableTransformError`.

This API owns only schema-valid table geometry. The host application owns authorization, protected
node rules, revision and conflict checks, destructive previews, payload limits, Yjs conversion and
persistence, and durable readback. In CleverTask, those checks belong to the collaboration and API
layers rather than Scribe.

## Usage

### Basic usage

```tsx
import "@radix-ui/themes/styles.css";
import "@clevertask/scribe/styles.css";
import { Theme } from "@radix-ui/themes";
import { Scribe, ScribeRef } from "@clevertask/scribe";

function App() {
  const onContentChange = useCallback(
    ({ markdownContent, htmlContent, jsonContent }: ScribeOnChangeContents) => {
      console.log(markdownContent, htmlContent, jsonContent);
    },
    [],
  );

  return (
    <Theme>
      <Scribe onContentChange={onContentChange} />
    </Theme>
  );
}
```

### With ref

```tsx
import "@radix-ui/themes/styles.css";
import "@clevertask/scribe/styles.css";
import { Theme } from "@radix-ui/themes";
import { Scribe, ScribeOnChangeContents } from "@clevertask/scribe";

function App() {
  const editor = useRef<ScribeRef>(null);

  const resetContent = useCallback(() => {
    editor.current.resetContent();
  }, []);

  return (
    <>
      <Theme>
        <Scribe ref={editor} />
      </Theme>
      <button onClick={resetContent}>Reset content</button>
    </>
  );
}
```

### Using Your App Theme

```tsx
import "@radix-ui/themes/styles.css";
import "@clevertask/scribe/styles.css";
import { Theme } from "@radix-ui/themes";
import { Scribe } from "@clevertask/scribe";

function App() {
  return (
    <Theme appearance="dark">
      <Scribe />
    </Theme>
  );
}
```

## Table Authoring

Type `/table` to insert a 3 × 3 table with a header row. Selecting a table cell opens nearby controls for adding or deleting rows and columns, toggling the header row, and deleting the table. Drag a column boundary to resize it.

The **Table layout** menu stores each table's explicit layout choice. **Auto** keeps the existing sizing behavior. **Fit to width** wraps the table into the available editor width and temporarily disables column resizing. **Scroll horizontally** retains authored column widths, gives columns without a saved width a readable 128px minimum, and scrolls inside the editor when the table needs more room. Switching layouts retains the table's saved column widths.

**Limit height** caps the table and enables vertical scrolling; shorter tables stay compact. In **Table layout → Maximum height…**, enter a whole number from 120 to 2000 pixels and choose **Apply** to set that table's maximum. **Use default** clears its override and uses the host's `--scribe-table-max-height`, with a 360px fallback. Turning **Limit height** off retains the saved maximum for when it is enabled again. Changing the maximum leaves the limit toggle, width layout, and sticky header preference unchanged.

Layout and height choices apply in both editing and read-only views, and remain intact when content is saved and loaded as JSON, HTML, or Markdown. Hosts can use `editor.commands.setTableLayout("scroll")` (accepts `"auto"`, `"fit"`, or `"scroll"`), `editor.commands.setTableHeightLimit(true)` (accepts a boolean), and `editor.commands.setTableMaxHeight(600)` (accepts a whole number from 120 to 2000, or `null` to restore the default) while the selection is inside an editable table. The optional `maxHeight` table attribute is serialized as `data-table-max-height` in HTML; existing tables without it keep the host default.

**Sticky header row** keeps the first row visible while scrolling, independently of **Limit height**. New tables created with `/table` or `insertTable` start with it enabled when their entire first row contains header cells. Existing and imported tables retain their saved setting; tables without a saved sticky preference stay off. Toggle it in **Table layout**. With **Limit height** on, the header stays at the top of the table's own scroll area. With it off, the header follows the document's vertical scroll area until the table ends. This also works with horizontal scrolling and retains saved column widths. The preference stays saved if the header row is removed and becomes active again when it is restored. It works in editing and read-only views. Hosts can use `editor.commands.setTableStickyHeaderRow(true)` to enable it or `false` to clear it while the selection is inside an editable table. For document scrolling, set `--scribe-table-sticky-header-offset` on the editor's container to leave room above the header for a document toolbar; the default is `0px`.

Keyboard users can press `Alt + F10` while editing a table to focus its controls, use the arrow, Home, and End keys to move between actions, and press Escape to return to the active cell.

Simple headed tables without layout, height, or sticky-header preferences serialize as GFM Markdown. Tables with those preferences (including a saved maximum while **Limit height** is off or an inactive sticky preference), merged cells, multiple blocks in a cell, resized columns, or other structures that GFM cannot represent are kept as sanitized raw HTML inside the Markdown output so their structure is not silently lost.

Scribe's `insertTable` command and `/table` action do not create a table while the selection is
already inside another table. Existing documents containing nested tables remain loadable so old
content is not destroyed. This guard covers Scribe-owned authoring paths only: arbitrary consumer
calls to `insertContent`, Markdown table paste, and rich-HTML table paste remain trusted integration
points. Applications that require a hard no-nested-table guarantee must validate or filter those
paths too.

## Links

Scribe uses Tiptap's Link extension for ordinary links and URL paste. Clicking an existing link
opens its popover with focus on the dialog, keeping the software keyboard closed. Choose
**Edit URL** or tap a field to start typing, then choose **Apply** or **Remove link**.
The toolbar Link action still focuses the URL immediately.
An unchanged label preserves the link's inline formatting. Keyboard users can press `Alt + F10`
from a link to open the form and Escape to return to the document.

Pasting recognizable URL-only content over selected text applies a link using native Tiptap
behavior; ordinary text replaces the selection. Rich clipboard content follows Tiptap's parsed
content handling. Scribe does not fetch metadata or create Compact/Preview card presentations.
Automatic links and URL paste use Tiptap's native URL/protocol recognition and safety checks,
including email and FTP links. The manual URL form accepts HTTP(S), bare domains and
root-relative links. Application-owned task and document reference extensions remain separate:
URL paste links eligible text around selected inline atoms without marking the atoms themselves,
while an atom-only selection follows normal paste replacement.

### Legacy preview compatibility

Saved `externalLinkPreview` nodes still load in the interactive and headless schemas and render
as ordinary links using their authored `linkText` and exact `href`. Their node identity, display
value and metadata remain serialized in HTML, JSON and Markdown. Reading a document does not
convert these nodes or discard metadata. No stored favicon or preview image is requested.

The exported `ExternalLinkPreview` extension, constants, types and `externalLinkPreview` options
remain for compatibility. `autoPreviewOnPaste`, `resolve` and `shouldPreview` are deprecated and
ignored; `HTMLAttributes` still applies to the legacy wrapper. A caller-owned `externalEditor`
must register the compatibility extension to read existing preview nodes.

The deprecated `insertExternalLinkPreview` and `updateExternalLinkPreview` commands retain the
legacy node shape and attributes, displayed as ordinary links, without fetching metadata.
`setExternalLinkDisplay("compact" | "card")` and `refreshExternalLinkPreview` return `false`.
`setExternalLinkDisplay("plain")` and `convertExternalLinkPreviewToPlain` remain explicit,
undoable conversions to ordinary Link-marked text. There is no automatic content migration.

## Experimental Table of Contents

Scribe can expose table-of-contents data without rendering a table-of-contents block inside the editable document. Enable the experimental API with `enableTableOfContents`, keep the latest items in your app state, and call `scrollToTableOfContentsItem` when a user selects an entry.

```tsx
import { Scribe, ScribeRef, ScribeTableOfContentsItem } from "@clevertask/scribe";
import { useRef, useState } from "react";

function DocumentEditor() {
  const scribe = useRef<ScribeRef>(null);
  const [tableOfContentsItems, setTableOfContentsItems] = useState<ScribeTableOfContentsItem[]>([]);

  return (
    <>
      <Scribe
        ref={scribe}
        enableTableOfContents
        onTableOfContentsChange={setTableOfContentsItems}
      />

      {tableOfContentsItems.length > 0 ? (
        <nav aria-label="Table of contents">
          {tableOfContentsItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scribe.current?.scrollToTableOfContentsItem(item)}
            >
              {item.textContent}
            </button>
          ))}
        </nav>
      ) : null}
    </>
  );
}
```

The table of contents currently tracks default TipTap heading nodes only. Each item includes the heading text, depth, document position, DOM node, and active/scrolled state. This API is marked experimental while we validate the contract in real document surfaces.

## Math Expressions

Scribe's default UI is styled with Radix Themes components. Load `@radix-ui/themes/styles.css` once in your app alongside `@clevertask/scribe/styles.css`, and render Scribe somewhere inside a Radix `<Theme>`.

Scribe ships with `@tiptap/extension-mathematics`. The extension renders math when it receives math nodes in the HTML:

```html
<span data-type="inline-math" data-latex="\alpha"></span>
<div data-type="block-math" data-latex="\sum_{i=1}^{n} x_i"></div>
```

### Typing Delimiters (Input Rules)

When typing directly in the editor, the built-in input rules use:

```
Inline: $$\alpha$$
Block: $$$\sum_{i=1}^{n} x_i$$$
```

### Markdown Delimiters

If you are parsing markdown with the Tiptap Markdown extension (not `md2html`), the tokenizer expects:

```
Inline: $\alpha$
Block: $$\sum_{i=1}^{n} x_i$$
```

If your content arrives as HTML (for example from a server), use the helper below to convert legacy delimiters into the HTML nodes that the math extension understands.

## External Undo and Redo Ownership

Scribe enables its built-in undo and redo history by default. Set `enableUndoRedo={false}` when a different extension owns history, such as Tiptap Collaboration:

```tsx
<Scribe enableUndoRedo={false} extensions={[Collaboration.configure({ document: ydoc })]} />
```

Scribe reads this option when it creates the editor. Remount Scribe to change it. If you pass an `externalEditor`, configure history on that editor instead. Do not add another ordinary history extension through `extensions` when collaboration owns undo and redo.

The `createScribeEditor` helper accepts the same `enableUndoRedo` option.

## Props

| Prop                      | Type                                                               | Default                    | Description                                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content`                 | `string`                                                           | `undefined`                | The initial content of the editor. Controlled updates through this prop are deprecated; prefer `ScribeRef.setContent` for programmatic updates after mount.                                                                                              |
| `ariaLabel`               | `string`                                                           | `Rich text editor`         | Sets the accessible name for the rich-text editing surface. Use a unique label when a page contains more than one editor.                                                                                                                                |
| `onContentChange`         | `(content: ScribeOnChangeContents) => void;`                       | `undefined`                | A callback function triggered whenever the editor's content changes. It receives an object containing the current content in various formats (`jsonContent`, `htmlContent`, `markdownContent`). Internal table-of-contents metadata updates are ignored. |
| `editable`                | `boolean`                                                          | `true`                     | Controls whether the editor is editable.                                                                                                                                                                                                                 |
| `autoFocus`               | `boolean`                                                          | `false`                    | Controls whether the editor should automatically focus when mounted.                                                                                                                                                                                     |
| `extensions`              | `Extension[]`                                                      | `undefined`                | You can set your own extensions for the text editor. For more information, [check the tip tap extensions docs](https://tiptap.dev/docs/editor/core-concepts/extensions)                                                                                  |
| `externalEditor`          | `Editor`                                                           | `undefined`                | Uses a caller-owned Tiptap editor. The caller remains responsible for its extension and plugin lifecycle, including table resizing, and for destroying it.                                                                                               |
| `enableUndoRedo`          | `boolean`                                                          | `true`                     | Enables Scribe's built-in undo and redo history. Set it to `false` when another extension owns history. This creation-time option does not configure a caller-owned `externalEditor`.                                                                    |
| `externalLinkPreview`     | `Partial<ExternalLinkPreviewOptions>`                              | `undefined`                | Deprecated compatibility options. Only HTMLAttributes affects legacy wrappers; metadata resolution, preview policy and automatic previews are ignored.                                                                                                   |
| `editorProps`             | `EditorProps`                                                      | `undefined`                | A tiptap-based prop to handle advanced use cases, you can read about it on their [documentation](https://tiptap.dev/docs/editor/api/editor#editorprops)                                                                                                  |
| `showBarMenu`             | `boolean`                                                          | `true`                     | Determines whether to show the text editor top menu bar or not. This menu bar shows options to format the text                                                                                                                                           |
| `placeholderText`         | `string`                                                           | `Type "/" for commands...` | Change the initial placeholder for your text editor                                                                                                                                                                                                      |
| `editorContentStyle`      | `React.CSSProperties`                                              | `undefined`                | You can send a CSS object to add styles to the editor content container. Useful if you want to limit the editor's height.                                                                                                                                |
| `editorContentClassName`  | `string`                                                           | `undefined`                | The same idea of `editorContentStyle` but with classes.                                                                                                                                                                                                  |
| `mainContainerStyle`      | `React.CSSProperties`                                              | `undefined`                | You can send a CSS object to style the main editor container                                                                                                                                                                                             |
| `mainContainerClassName`  | `string`                                                           | `undefined`                | The same idea of `mainContainerStyle` but with classes.                                                                                                                                                                                                  |
| `onKeyDown`               | `KeyboardEventHandler`                                             | `undefined`                | A callback function that is triggered when a key is pressed within the editor. This allows you to handle custom keyboard shortcuts. For example, you can use this prop to implement a "send message" functionality when `Ctrl + Enter` is pressed.       |
| `enableTableOfContents`   | `boolean`                                                          | `false`                    | Experimental. Enables the app-owned table-of-contents API for heading nodes.                                                                                                                                                                             |
| `onTableOfContentsChange` | `(items: ScribeTableOfContentsItem[], isCreate?: boolean) => void` | `undefined`                | Experimental. Receives table-of-contents items whenever heading text, structure, or active/scrolled state changes.                                                                                                                                       |

## Helper Functions

### `md2html`

```typescript
export declare function md2html(md: string): string;
```

Convert markdown to html. Useful if you're rendering an AI-based response, or if you were storing content on markdown in your database and want to show it on the text editor. This function sanitizes the content to prevent XSS attacks.

Editable Scribe instances also use this conversion internally when you paste plain-text markdown into the editor.

**Usage Example**:

```tsx
import { md2html, Scribe } from "@clevertask/scribe";
import { Flex, Heading } from "@radix-ui/themes";
import { Message, useChat } from "@ai-sdk/react";

const ChatMessages = () => {
  const { messages } = useChat({
    /* For more info, see https://sdk.vercel.ai/docs/reference/ai-sdk-ui/use-chat */
  });

  return messages.map((message) => (
    <Flex key={message.id} direction="column" mb="4">
      <Heading size="4">{`${message.role}: `}</Heading>
      <Scribe editable={false} showBarMenu={false} content={md2html(message.content)} />
    </Flex>
  ));
};
```

---

### `html2md`

```typescript
export declare function html2md(html: string): string;
```

Convert html to markdown. Useful if you want to send a text to an AI model by keeping the text format with markdown. This function sanitizes the content to prevent XSS attacks.

**Usage Example**:

```tsx
import { html2md, Scribe } from "@clevertask/scribe";

const md = html2md("<h1>Hello world</h1>"); // Output: # Hello world
```

> **Note**: The Scribe component already exposes a property called `markdownContent` when the `onContentChange` is used. In fact, the `markdownContent` is the output of the usage of the `html2md` function.

---

### `convertLegacyMathDelimiters`

```typescript
export declare function convertLegacyMathDelimiters(input: string): string;
```

Convert legacy math delimiters into the HTML nodes required by the mathematics extension. This is useful when you receive HTML from a server that contains legacy math like `\(...\)` or `\[...\]`.

This helper is primarily for consumers upgrading from older Scribe versions who stored math expressions using the legacy formats. It aims to be accurate, but the previous format was ambiguous (no explicit `$$` delimiters), so conversion is best-effort and not guaranteed in every case.

**Supported legacy delimiters**:

- `\(...\)` for inline math
- `\[...\]` for block math
- `(...)` and `[...]` when the content looks like LaTeX (contains `\`, `^`, or `_`)

**Usage Example**:

```tsx
import { convertLegacyMathDelimiters, md2html, Scribe } from "@clevertask/scribe";

const html = md2html(convertLegacyMathDelimiters(rawMarkdown));

// OR

const html = convertLegacyMathDelimiters(htmlContent);

<Scribe editable={false} showBarMenu={false} content={html} />;
```

If you already receive HTML from the server, call `convertLegacyMathDelimiters` directly on that HTML before rendering.

## Roadmap

We're constantly working to improve @clevertask/scribe. Here are some features we're planning to implement:

- **New default blocks/extensions:** Such as image, video, callout, and table blocks
- **E2E tests**: It will ensure this component's working as expected.

We're excited about these upcoming features and welcome any feedback or contributions from the community. If you have any suggestions or would like to contribute to any of these features, please open an issue or submit a pull request on our GitHub repository.

## Release Process

Publishing is split into two explicit GitHub Actions after a change reaches `main`:

1. Run **Create Release Version** from `main` and enter the version to release.
2. Wait for it to commit the version, create the tag, and create the GitHub release.
3. Run **Publish Package** from the immutable `v<version>` tag and choose the `latest` or
   `next` npm tag.
4. Confirm the new version is available in the npm registry before updating consumers.

## License

MIT

## Credits

This project is built on top of the excellent [BlockEditor](https://github.com/Sachin-chaurasiya/BlockEditor) repository by Sachin Chaurasiya. We extend our sincere gratitude for their work. <3
