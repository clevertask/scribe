import type { AnyExtension, Node as TiptapNode } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, type Transaction } from "@tiptap/pm/state";

export type ScribeReadOnlyTaskItemCheck = {
  /** Zero-based task-item order in the document before this action. */
  checkboxIndex: number;
  previousChecked: boolean;
  checked: boolean;
};

export type ScribeReadOnlyTaskItemChecks = {
  /** Disable checkbox actions while the consumer saves or cannot accept a change. */
  disabled?: boolean;
  /** Called after one local checkbox-only change. The consumer owns persistence and recovery. */
  onChange(change: ScribeReadOnlyTaskItemCheck): void;
};

export const createReadOnlyTaskItemChecksBridge = (
  getCapability: () => ScribeReadOnlyTaskItemChecks | undefined,
) => {
  const synchronizeViews = new Set<() => void>();
  let allowedChange: { transaction: Transaction; document: ProseMirrorNode } | null = null;

  return {
    synchronize() {
      synchronizeViews.forEach((synchronize) => synchronize());
    },
    extend(taskItem: AnyExtension) {
      return (taskItem as TiptapNode).extend({
        addProseMirrorPlugins() {
          return [
            ...(this.parent?.() ?? []),
            new Plugin({
              filterTransaction(transaction) {
                // Appended or re-entrant text/structure changes cannot ride along
                // with an action that the consumer will persist as one checkbox.
                return (
                  !allowedChange ||
                  !transaction.docChanged ||
                  (transaction === allowedChange.transaction &&
                    transaction.doc.eq(allowedChange.document))
                );
              },
            }),
          ];
        },
        addNodeView() {
          const createParentView = this.parent?.();
          if (!createParentView) throw new Error("TaskItem must provide its checkbox node view");

          return (props) => {
            const nodeView = createParentView(props);
            const checkbox = (nodeView.dom as HTMLElement).querySelector<HTMLInputElement>(
              ':scope > label > input[type="checkbox"]',
            );
            if (!checkbox) return nodeView;

            const { editor, getPos } = props;
            let renderedNode = props.node;
            const synchronize = () => {
              const capability = getCapability();
              checkbox.disabled =
                !editor.isEditable && (!capability || Boolean(capability.disabled));
            };
            synchronizeViews.add(synchronize);
            synchronize();

            const handleChange = (event: Event) => {
              if (editor.isEditable) return;
              // The upstream handler focuses editable text or reverts read-only
              // checks. Handle only this explicitly permitted read-only action.
              event.stopImmediatePropagation();
              const checked = checkbox.checked;
              checkbox.checked = Boolean(renderedNode.attrs.checked);
              const capability = getCapability();
              if (!capability || capability.disabled || allowedChange || editor.isDestroyed) return;

              const position = getPos();
              if (typeof position !== "number") return;
              const before = editor.state.doc;
              const node = before.nodeAt(position);
              if (!node || node.type !== renderedNode.type || !node.eq(renderedNode)) return;
              const previousChecked = Boolean(node.attrs.checked);
              if (checked === previousChecked) return;

              let checkboxIndex = -1;
              let taskItemCount = 0;
              before.descendants((candidate, candidatePosition) => {
                if (candidate.type === node.type) {
                  if (candidatePosition === position) checkboxIndex = taskItemCount;
                  taskItemCount += 1;
                }
              });
              if (checkboxIndex < 0) return;

              const transaction = editor.state.tr.setNodeMarkup(position, undefined, {
                ...node.attrs,
                checked,
              });
              const expectedDocument = transaction.doc;
              allowedChange = { transaction, document: expectedDocument };
              try {
                editor.view.dispatch(transaction);
              } finally {
                allowedChange = null;
                synchronize();
              }

              if (editor.state.doc.eq(expectedDocument)) {
                capability.onChange({ checkboxIndex, previousChecked, checked });
              }
            };
            checkbox.addEventListener("change", handleChange, true);

            return {
              ...nodeView,
              update(node, decorations, innerDecorations) {
                const updated = nodeView.update?.(node, decorations, innerDecorations) ?? false;
                if (updated) {
                  renderedNode = node;
                  synchronize();
                }
                return updated;
              },
              destroy() {
                synchronizeViews.delete(synchronize);
                checkbox.removeEventListener("change", handleChange, true);
                nodeView.destroy?.();
              },
            };
          };
        },
      });
    },
  };
};
