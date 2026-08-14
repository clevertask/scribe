import { isNodeActive, mergeAttributes, Node } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { NodeType } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

export const CALLOUT_VARIANTS = ["info", "tip", "warning", "caution"] as const;

export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

export const DEFAULT_CALLOUT_VARIANT: CalloutVariant = "info";

export const CALLOUT_VARIANT_LABELS = {
  info: "Info",
  tip: "Tip",
  warning: "Warning",
  caution: "Caution",
} as const satisfies Record<CalloutVariant, string>;

export interface CalloutOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      /** Wrap the selected block or blocks in a callout. */
      insertCallout: (variant?: CalloutVariant) => ReturnType;
      /** Change the semantic variant of the selected callout. */
      setCalloutVariant: (variant: CalloutVariant) => ReturnType;
      /** Wrap the selection in a callout, or unwrap an active callout. */
      toggleCallout: (variant?: CalloutVariant) => ReturnType;
      /** Lift the selected block or blocks out of their callout. */
      unsetCallout: () => ReturnType;
    };
  }
}

export const isCalloutVariant = (value: unknown): value is CalloutVariant =>
  typeof value === "string" && CALLOUT_VARIANTS.some((variant) => variant === value);

const normalizeCalloutVariant = (value: unknown): CalloutVariant =>
  isCalloutVariant(value) ? value : DEFAULT_CALLOUT_VARIANT;

const validateCalloutVariant = (value: unknown) => {
  if (!isCalloutVariant(value)) {
    throw new RangeError(`Invalid callout variant: ${String(value)}`);
  }
};

/**
 * Keep Backspace at callout boundaries consistent with other defining wrapper nodes.
 * A child after the first one is lifted out, while a following paragraph is merged
 * into the callout instead of being pulled into a new nested position.
 */
const handleCalloutBackspace = (editor: Editor, type: NodeType): boolean => {
  const { selection } = editor.state;

  if (!selection.empty || selection.$from.parentOffset !== 0) {
    return false;
  }

  const { $from } = selection;
  const parentDepth = $from.depth - 1;

  if (parentDepth < 0) {
    return false;
  }

  const parent = $from.node(parentDepth);
  const index = $from.index(parentDepth);

  if (index === 0) {
    return false;
  }

  if (parent.type === type) {
    return editor.commands.lift(type.name);
  }

  const previous = parent.child(index - 1);

  if (previous.type !== type || !previous.lastChild?.isTextblock) {
    return false;
  }

  const blockStart = $from.before();
  const targetPosition = blockStart - 2;
  const { tr } = editor.state;

  tr.delete(blockStart, $from.after()).insert(targetPosition, $from.parent.content);
  tr.setSelection(TextSelection.create(tr.doc, targetPosition));
  editor.view.dispatch(tr.scrollIntoView());

  return true;
};

/**
 * Reuse StarterKit's existing trailing paragraph when a second Enter exits a callout.
 * Without this, lifting the empty final child would leave two adjacent empty paragraphs.
 */
const handleCalloutEnter = (editor: Editor, type: NodeType): boolean => {
  const { selection, tr } = editor.state;

  if (!selection.empty) {
    return false;
  }

  const { $from } = selection;
  const paragraphType = editor.schema.nodes.paragraph;

  if (!paragraphType || $from.parent.type !== paragraphType || $from.parent.content.size) {
    return false;
  }

  let calloutDepth: number | undefined;

  for (let depth = $from.depth - 1; depth > 0; depth -= 1) {
    if ($from.node(depth).type === type) {
      calloutDepth = depth;
      break;
    }
  }

  if (calloutDepth === undefined) {
    return false;
  }

  const callout = $from.node(calloutDepth);
  const childIndex = $from.index(calloutDepth);

  if (callout.childCount < 2 || childIndex !== callout.childCount - 1) {
    return false;
  }

  const outerDepth = calloutDepth - 1;
  const outerParent = $from.node(outerDepth);
  const calloutIndex = $from.index(outerDepth);
  const nextNode = outerParent.maybeChild(calloutIndex + 1);

  if (nextNode?.type !== paragraphType || nextNode.content.size) {
    return false;
  }

  const nextNodeCursor = $from.after(calloutDepth) + 1;

  tr.delete($from.before(), $from.after());
  tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(nextNodeCursor)));
  editor.view.dispatch(tr.scrollIntoView());

  return true;
};

/** A persistent, semantic heads-up block for document content. */
export const Callout = Node.create<CalloutOptions>({
  name: "callout",

  group: "block",

  content: "block+",

  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      variant: {
        default: DEFAULT_CALLOUT_VARIANT,
        validate: validateCalloutVariant,
        parseHTML: (element) => normalizeCalloutVariant(element.getAttribute("data-variant")),
        renderHTML: ({ variant }) => ({
          "data-variant": normalizeCalloutVariant(variant),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'aside[data-type="callout"]',
        contentElement: (element) => {
          const generatedContent = Array.from(element.children).find((child) =>
            child.hasAttribute("data-callout-content"),
          );

          return generatedContent instanceof HTMLElement ? generatedContent : element;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const variant = normalizeCalloutVariant(HTMLAttributes["data-variant"]);

    return [
      "aside",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": this.name,
        "data-variant": variant,
        role: "note",
      }),
      [
        "div",
        {
          "data-callout-header": "",
          contenteditable: "false",
        },
        [
          "span",
          {
            "aria-hidden": "true",
            "data-callout-icon": "",
          },
        ],
        ["span", { "data-callout-label": "" }, CALLOUT_VARIANT_LABELS[variant]],
      ],
      ["div", { "data-callout-content": "" }, 0],
    ];
  },

  addCommands() {
    return {
      insertCallout:
        (variant = DEFAULT_CALLOUT_VARIANT) =>
        ({ commands }) =>
          isCalloutVariant(variant) && commands.wrapIn(this.name, { variant }),
      setCalloutVariant:
        (variant) =>
        ({ commands }) =>
          isCalloutVariant(variant) && commands.updateAttributes(this.name, { variant }),
      toggleCallout:
        (variant = DEFAULT_CALLOUT_VARIANT) =>
        ({ commands, state }) => {
          if (!isCalloutVariant(variant)) {
            return false;
          }

          return isNodeActive(state, this.type)
            ? commands.lift(this.name)
            : commands.wrapIn(this.name, { variant });
        },
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => handleCalloutBackspace(this.editor, this.type),
      Enter: () => handleCalloutEnter(this.editor, this.type),
    };
  },
});

export default Callout;
