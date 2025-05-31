# @clevertask/scribe

A versatile, block-based rich text editor for diverse applications, built with Tiptap and inspired by Notion's intuitive interface. `@clevertask/scribe` allows you to seamlessly view, create, and edit rich text content, with added support for Markdown parsing.

## Features

- **Block-based Editing:** Enjoy a familiar and intuitive Notion-style editing experience.
- **Markdown Support:** Parse and render Markdown content effortlessly.
- **Versatile Integration:** Easily integrate `@clevertask/scribe` into any project requiring rich text editing.
- **View and Edit:** Seamlessly switch between viewing and editing modes.

## Table of Contents

- [@clevertask/scribe](#clevertaskscribe)
  - [Installation](#installation)
  - [Usage](#usage)
  - [Props](#props)
  - [Helper Functions](#helper-functions)
    - [md2html](#md2html)
    - [html2md](#html2md)
  - [Roadmap](#roadmap)
  - [Release Process](#release-process)
  - [License](#license)
  - [Credits](#credits)

## Installation

```bash
npm install @clevertask/scribe
```

## Usage

### Basic usage

```tsx
import "@clevertask/scribe/dist/main.css";
import { Scribe, ScribeOnChangeContents } from "@clevertask/scribe";

function App() {
  const onContentChange = useCallback(({ markdownContent, htmlContent, jsonContent }: ScribeOnChangeContents) => {
    console.log(markdownContent, htmlContent, jsonContent);
  }, []);

  return <Scribe onContentChange={onContentChange} />;
}
```

### With ref

```tsx
import "@clevertask/scribe/dist/main.css";
import { Scribe, ScribeOnChangeContents } from "@clevertask/scribe";

function App() {
  const editor = useRef<ScribeRef>(null);

  const resetContent = useCallback(() => {
    editor.current.resetContent();
  }, []);

  return (
    <>
      <Scribe ref={editor} />
      <button onClick={resetContent}>Reset content</button>
    </>
  );
}
```

### With Dark Mode

```tsx
import "@clevertask/scribe/dist/main.css";
import { Scribe, ScribeOnChangeContents } from "@clevertask/scribe";

function App() {
  const editor = useRef<ScribeRef>(null);

  const resetContent = useCallback(() => {
    editor.current.resetContent();
  }, []);

  return (
    <>
      <Scribe darkMode />
      <button onClick={resetContent}>Reset content</button>
    </>
  );
}
```

## Props

| Prop                     | Type                                         | Default                    | Description                                                                                                                                                                                                                                        |
| ------------------------ | -------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content`                | `string`                                     | `undefined`                | The initial content of the editor. This prop can also be used to control the editor's content. When `content` is updated, the editor's content will be updated accordingly.                                                                        |
| `onContentChange`        | `(content: ScribeOnChangeContents) => void;` | `undefined`                | A callback function triggered whenever the editor's content changes. It receives an object containing the current content in various formats (`jsonContent`, `htmlContent`, `markdownContent`).                                                    |
| `editable`               | `boolean`                                    | `true`                     | Controls whether the editor is editable.                                                                                                                                                                                                           |
| `autoFocus`              | `boolean`                                    | `false`                    | Controls whether the editor should automatically focus when mounted.                                                                                                                                                                               |
| `extensions`             | `Extension[]`                                | `undefined`                | You can set your own extensions for the text editor. For more information, [check the tip tap extensions docs](https://tiptap.dev/docs/editor/core-concepts/extensions)                                                                            |
| `editorProps`            | `EditorProps`                                | `undefined`                | A tiptap-based prop to handle advanced use cases, you can read about it on their [documentation](https://tiptap.dev/docs/editor/api/editor#editorprops)                                                                                            |
| `showBarMenu`            | `boolean`                                    | `true`                     | Determines whether to show the text editor top menu bar or not. This menu bar shows options to format the text                                                                                                                                     |
| `placeholderText`        | `string`                                     | `Type "/" for commands...` | Change the initial placeholder for your text editor                                                                                                                                                                                                |
| `editorContentStyle`     | `React.CSSProperties`                        | `undefined`                | You can send a CSS object to add styles to the editor content container. Useful if you want to limit the editor's height.                                                                                                                          |
| `editorContentClassName` | `string`                                     | `undefined`                | The same idea of `editorContentStyle` but with classes.                                                                                                                                                                                            |
| `mainContainerStyle`     | `React.CSSProperties`                        | `undefined`                | You can send a CSS object to style the main editor container                                                                                                                                                                                       |
| `mainContainerClassName` | `string`                                     | `undefined`                | The same idea of `mainContainerStyle` but with classes.                                                                                                                                                                                            |
| `onKeyDown`              | `KeyboardEventHandler`                       | `undefined`                | A callback function that is triggered when a key is pressed within the editor. This allows you to handle custom keyboard shortcuts. For example, you can use this prop to implement a "send message" functionality when `Ctrl + Enter` is pressed. |
| `darkMode`               | `boolean`                                    | `false`                    | You can switch the darkMode value to change the text editor's theme                                                                                                                                                                                |

## Helper Functions

### `md2html`

```typescript
export declare function md2html(md: string): string;
```

Convert markdown to html. Useful if you're rendering an AI-based response, or if you were storing content on markdown in your database and want to show it on the text editor. This function sanitizes the content to prevent XSS attacks.

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

## Roadmap

We're constantly working to improve @clevertask/scribe. Here are some features we're planning to implement:

- **New default blocks/extensions:** Such as image, video, callout, and table blocks
- **E2E tests**: It will ensure this component's working as expected.

We're excited about these upcoming features and welcome any feedback or contributions from the community. If you have any suggestions or would like to contribute to any of these features, please open an issue or submit a pull request on our GitHub repository.

## Release Process

This package is automatically published to npm when a new release is created on GitHub. To create a new release:

1. Update the version in `package.json` according to semantic versioning rules.
2. Commit the version change: `git commit -am "Bump version to x.x.x"`
3. Create a new tag: `git tag x.x.x`
4. Push the changes and the tag: `git push && git push --tags`
5. Go to the GitHub repository and create a new release, selecting the tag you just created.

The GitHub Action will automatically build, test, and publish the new version to npm.

## License

MIT

## Credits

This project is built on top of the excellent [BlockEditor](https://github.com/Sachin-chaurasiya/BlockEditor) repository by Sachin Chaurasiya. We extend our sincere gratitude for their work. <3
