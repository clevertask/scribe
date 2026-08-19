import { Button, Flex, Text } from "@radix-ui/themes";
import type { Editor } from "@tiptap/react";
import { useCallback, useId } from "react";
import type { ExternalLinkDisplay } from "../Scribe/extension/external-link-preview/types";

export type { ExternalLinkDisplay } from "../Scribe/extension/external-link-preview/types";

export interface ExternalLinkDisplayOptionsProps {
  currentDisplay: ExternalLinkDisplay;
  editor: Editor;
  executeDisplayChange?: (display: ExternalLinkDisplay) => boolean;
  onDisplayChange?: (display: ExternalLinkDisplay) => void;
  targetPosition?: number;
}

type ExternalLinkDisplayCommand = (
  display: ExternalLinkDisplay,
  targetPosition?: number,
) => boolean;

type ExternalLinkDisplayCommands = {
  setExternalLinkDisplay?: ExternalLinkDisplayCommand;
};

const DISPLAY_OPTIONS: Array<{
  description: string;
  display: ExternalLinkDisplay;
  label: string;
}> = [
  {
    description: "Show a regular text link.",
    display: "plain",
    label: "Plain link",
  },
  {
    description: "Show the page title and site icon.",
    display: "compact",
    label: "Compact",
  },
  {
    description: "Show an image, title, and description.",
    display: "card",
    label: "Preview card",
  },
];

const getDisplayCommands = (editor: Editor) =>
  editor.commands as typeof editor.commands & ExternalLinkDisplayCommands;

const getCanDisplayCommands = (editor: Editor) =>
  editor.can() as ReturnType<Editor["can"]> & ExternalLinkDisplayCommands;

const ExternalLinkDisplayOptions = ({
  currentDisplay,
  editor,
  executeDisplayChange,
  onDisplayChange,
  targetPosition,
}: ExternalLinkDisplayOptionsProps) => {
  const displayOptionsId = useId();
  const commands = getDisplayCommands(editor);
  const canCommands = getCanDisplayCommands(editor);
  const hasDisplayCommand = typeof commands.setExternalLinkDisplay === "function";
  const canSetDisplay = (display: ExternalLinkDisplay) =>
    typeof targetPosition === "number"
      ? Boolean(canCommands.setExternalLinkDisplay?.(display, targetPosition))
      : Boolean(canCommands.setExternalLinkDisplay?.(display));
  const displayAvailability: Record<ExternalLinkDisplay, boolean> = {
    plain: currentDisplay === "plain" || canSetDisplay("plain"),
    compact: currentDisplay === "compact" || canSetDisplay("compact"),
    card: currentDisplay === "card" || canSetDisplay("card"),
  };
  const canSetCompact = hasDisplayCommand && displayAvailability.compact;
  const canSetCard = hasDisplayCommand && displayAvailability.card;
  const previewConversionAvailable = currentDisplay !== "plain" || canSetCompact || canSetCard;

  const handleDisplayChange = useCallback(
    (display: ExternalLinkDisplay) => {
      if (display === currentDisplay) {
        return;
      }

      const didChange =
        executeDisplayChange?.(display) ??
        (typeof targetPosition === "number"
          ? editor.chain().focus().setExternalLinkDisplay(display, targetPosition).run()
          : getDisplayCommands(editor).setExternalLinkDisplay?.(display));

      if (!didChange) {
        return;
      }

      onDisplayChange?.(display);
    },
    [currentDisplay, editor, executeDisplayChange, onDisplayChange, targetPosition],
  );

  if (!hasDisplayCommand || !previewConversionAvailable) {
    return null;
  }

  return (
    <Flex direction="column" gap="2">
      <Text as="p" size="2" weight="medium">
        Display as
      </Text>
      <Flex role="group" aria-label="Display as" direction="column" gap="1">
        {DISPLAY_OPTIONS.map((option) => {
          const isCurrent = currentDisplay === option.display;
          const isAvailable = displayAvailability[option.display];
          const descriptionId = `${displayOptionsId}-${option.display}-description`;
          const description =
            option.display === "card" && !isAvailable
              ? "Preview card needs its own line."
              : option.description;

          return (
            <Button
              key={option.display}
              type="button"
              aria-describedby={descriptionId}
              aria-label={option.label}
              aria-pressed={isCurrent}
              color="gray"
              disabled={!isAvailable}
              variant={isCurrent ? "soft" : "ghost"}
              onClick={() => handleDisplayChange(option.display)}
              style={{
                height: "auto",
                justifyContent: "flex-start",
                paddingBottom: 8,
                paddingTop: 8,
                textAlign: "left",
                width: "100%",
              }}
            >
              <Flex direction="column" gap="1" align="start">
                <Text as="span" size="2" weight="medium">
                  {option.label}
                </Text>
                <Text id={descriptionId} as="span" size="1" color="gray">
                  {description}
                </Text>
              </Flex>
            </Button>
          );
        })}
      </Flex>
    </Flex>
  );
};

export default ExternalLinkDisplayOptions;
