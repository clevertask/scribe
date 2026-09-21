// @vitest-environment node

import { getSchema, Node as TiptapNode, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import { describe, expect, it } from "vitest";
import { createScribeSchemaExtensions } from "../lib/schema";
import {
  applyTableTransformPoc,
  type TableTransformOperation,
} from "./support/table-transform-kernel-poc";

const TestConsumerReference = TiptapNode.create({
  name: "testConsumerReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      resourceId: { default: null },
      resourceType: { default: "task" },
    };
  },
});

const schema = getSchema([
  ...createScribeSchemaExtensions({ enableUndoRedo: false }),
  TestConsumerReference,
]);

const paragraph = (text?: string): JSONContent => ({
  type: "paragraph",
  ...(text ? { content: [{ type: "text", text }] } : {}),
});

const cell = (
  content: JSONContent[],
  options: {
    type?: "tableCell" | "tableHeader";
    colspan?: number;
    rowspan?: number;
  } = {},
): JSONContent => ({
  type: options.type ?? "tableCell",
  attrs: {
    colspan: options.colspan ?? 1,
    rowspan: options.rowspan ?? 1,
    colwidth: null,
    align: null,
  },
  content,
});

const row = (cells: JSONContent[]): JSONContent => ({ type: "tableRow", content: cells });

const table = (rows: JSONContent[]): JSONContent => ({ type: "table", content: rows });

const documentWithTable = (tableContent: JSONContent): ProseMirrorNode =>
  schema.nodeFromJSON({
    type: "doc",
    content: [paragraph("Before"), tableContent, paragraph("After")],
  });

const bodyTable = (rows: string[][]): JSONContent =>
  table(rows.map((values) => row(values.map((value) => cell([paragraph(value)])))));

const createState = (doc: ProseMirrorNode, stateSchema: Schema = schema) =>
  EditorState.create({ schema: stateSchema, doc });

const tablePositions = (doc: ProseMirrorNode) => {
  const positions: number[] = [];

  doc.descendants((node, position) => {
    if (node.type.spec.tableRole === "table") {
      positions.push(position);
    }
  });

  return positions;
};

const getTable = (doc: ProseMirrorNode, position: number) => {
  const tableNode = doc.nodeAt(position);

  if (tableNode?.type.spec.tableRole !== "table") {
    throw new Error("Expected a table at the requested position.");
  }

  return tableNode;
};

const tableTextGrid = (tableNode: ProseMirrorNode) =>
  Array.from({ length: tableNode.childCount }, (_, rowIndex) => {
    const rowNode = tableNode.child(rowIndex);

    return Array.from(
      { length: rowNode.childCount },
      (_, columnIndex) => rowNode.child(columnIndex).textContent,
    );
  });

const expectValidTable = (
  doc: ProseMirrorNode,
  position: number,
  rows: number,
  columns: number,
) => {
  expect(() => doc.check()).not.toThrow();

  const map = TableMap.get(getTable(doc, position));

  expect(map.problems).toBeNull();
  expect({ rows: map.height, columns: map.width }).toEqual({ rows, columns });
};

const apply = (
  doc: ProseMirrorNode,
  operation: TableTransformOperation,
  position = tablePositions(doc)[0],
) => {
  if (position === undefined) {
    throw new Error("Expected the fixture to contain a table.");
  }

  return applyTableTransformPoc(createState(doc), position, operation);
};

const expectOuterSiblingIdentity = (before: ProseMirrorNode, after: ProseMirrorNode) => {
  expect(after.firstChild).toBe(before.firstChild);
  expect(after.lastChild).toBe(before.lastChild);
};

describe("headless table transform kernel PoC", () => {
  it("runs without a DOM or EditorView", () => {
    expect(globalThis.document).toBeUndefined();

    const doc = documentWithTable(bodyTable([["A", "B"]]));
    const result = apply(doc, { type: "add_row", index: 1 });

    expect(result.before).toEqual({ rows: 1, columns: 2 });
    expect(result.after).toEqual({ rows: 2, columns: 2 });
    expectValidTable(result.transaction.doc, tablePositions(doc)[0]!, 2, 2);
  });

  it.each([0, 1, 2, 3])("adds a row at exact boundary %i", (index) => {
    const originalGrid = [
      ["A1", "A2"],
      ["B1", "B2"],
      ["C1", "C2"],
    ];
    const doc = documentWithTable(bodyTable(originalGrid));
    const tablePosition = tablePositions(doc)[0]!;
    const result = apply(doc, { type: "add_row", index }, tablePosition);
    const expectedGrid = [...originalGrid];

    expectedGrid.splice(index, 0, ["", ""]);

    expect(tableTextGrid(getTable(result.transaction.doc, tablePosition))).toEqual(expectedGrid);
    expectValidTable(result.transaction.doc, tablePosition, 4, 2);
    expectOuterSiblingIdentity(doc, result.transaction.doc);
  });

  it.each([0, 1, 2])("deletes exact row %i", (index) => {
    const originalGrid = [
      ["A1", "A2"],
      ["B1", "B2"],
      ["C1", "C2"],
    ];
    const doc = documentWithTable(bodyTable(originalGrid));
    const tablePosition = tablePositions(doc)[0]!;
    const result = apply(doc, { type: "delete_row", index }, tablePosition);
    const expectedGrid = originalGrid.filter((_, rowIndex) => rowIndex !== index);

    expect(tableTextGrid(getTable(result.transaction.doc, tablePosition))).toEqual(expectedGrid);
    expectValidTable(result.transaction.doc, tablePosition, 2, 2);
    expectOuterSiblingIdentity(doc, result.transaction.doc);
  });

  it.each([0, 1, 2])("adds a column at exact boundary %i", (index) => {
    const originalGrid = [
      ["A1", "A2"],
      ["B1", "B2"],
    ];
    const doc = documentWithTable(bodyTable(originalGrid));
    const tablePosition = tablePositions(doc)[0]!;
    const result = apply(doc, { type: "add_column", index }, tablePosition);
    const expectedGrid = originalGrid.map((values) => {
      const nextValues = [...values];
      nextValues.splice(index, 0, "");
      return nextValues;
    });

    expect(tableTextGrid(getTable(result.transaction.doc, tablePosition))).toEqual(expectedGrid);
    expectValidTable(result.transaction.doc, tablePosition, 2, 3);
    expectOuterSiblingIdentity(doc, result.transaction.doc);
  });

  it.each([0, 1])("deletes exact column %i", (index) => {
    const originalGrid = [
      ["A1", "A2"],
      ["B1", "B2"],
    ];
    const doc = documentWithTable(bodyTable(originalGrid));
    const tablePosition = tablePositions(doc)[0]!;
    const result = apply(doc, { type: "delete_column", index }, tablePosition);
    const expectedGrid = originalGrid.map((values) =>
      values.filter((_, columnIndex) => columnIndex !== index),
    );

    expect(tableTextGrid(getTable(result.transaction.doc, tablePosition))).toEqual(expectedGrid);
    expectValidTable(result.transaction.doc, tablePosition, 2, 1);
    expectOuterSiblingIdentity(doc, result.transaction.doc);
  });

  it("adds and deletes exact grid boundaries through existing row and column spans", () => {
    const rowSpanDoc = documentWithTable(
      table([
        row([cell([paragraph("Tall")], { rowspan: 2 }), cell([paragraph("Top right")])]),
        row([cell([paragraph("Bottom right")])]),
      ]),
    );
    const rowSpanTablePosition = tablePositions(rowSpanDoc)[0]!;
    const originalTallContent = getTable(rowSpanDoc, rowSpanTablePosition).firstChild!.firstChild!
      .firstChild!;
    const addedRow = apply(rowSpanDoc, { type: "add_row", index: 1 }, rowSpanTablePosition);
    const addedRowTable = getTable(addedRow.transaction.doc, rowSpanTablePosition);

    expect(addedRowTable.firstChild!.firstChild!.attrs.rowspan).toBe(3);
    expect(addedRowTable.firstChild!.firstChild!.firstChild).toBe(originalTallContent);
    expect(addedRowTable.child(1).childCount).toBe(1);
    expect(addedRowTable.child(1).firstChild!.textContent).toBe("");
    expectValidTable(addedRow.transaction.doc, rowSpanTablePosition, 3, 2);

    const deletedRow = apply(
      addedRow.transaction.doc,
      { type: "delete_row", index: 1 },
      rowSpanTablePosition,
    );

    expect(deletedRow.transaction.doc.eq(rowSpanDoc)).toBe(true);
    expectValidTable(deletedRow.transaction.doc, rowSpanTablePosition, 2, 2);
    expectOuterSiblingIdentity(addedRow.transaction.doc, deletedRow.transaction.doc);

    const columnSpanDoc = documentWithTable(
      table([
        row([cell([paragraph("Wide")], { colspan: 2 })]),
        row([cell([paragraph("Bottom left")]), cell([paragraph("Bottom right")])]),
      ]),
    );
    const columnSpanTablePosition = tablePositions(columnSpanDoc)[0]!;
    const originalWideContent = getTable(columnSpanDoc, columnSpanTablePosition).firstChild!
      .firstChild!.firstChild!;
    const addedColumn = apply(
      columnSpanDoc,
      { type: "add_column", index: 1 },
      columnSpanTablePosition,
    );
    const addedColumnTable = getTable(addedColumn.transaction.doc, columnSpanTablePosition);

    expect(addedColumnTable.firstChild!.firstChild!.attrs.colspan).toBe(3);
    expect(addedColumnTable.firstChild!.firstChild!.firstChild).toBe(originalWideContent);
    expect(addedColumnTable.child(1).childCount).toBe(3);
    expect(addedColumnTable.child(1).child(1).textContent).toBe("");
    expectValidTable(addedColumn.transaction.doc, columnSpanTablePosition, 2, 3);

    const deletedColumn = apply(
      addedColumn.transaction.doc,
      { type: "delete_column", index: 1 },
      columnSpanTablePosition,
    );

    expect(deletedColumn.transaction.doc.eq(columnSpanDoc)).toBe(true);
    expectValidTable(deletedColumn.transaction.doc, columnSpanTablePosition, 2, 2);
    expectOuterSiblingIdentity(addedColumn.transaction.doc, deletedColumn.transaction.doc);
  });

  it("preserves rich cell blocks and a consumer inline atom through merge and split", () => {
    const richTable = table([
      row([
        cell([
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Linked " },
              {
                type: "testConsumerReference",
                attrs: { resourceId: "task-123", resourceType: "task" },
              },
            ],
          },
          {
            type: "callout",
            attrs: { variant: "warning" },
            content: [paragraph("Keep the warning")],
          },
        ]),
        cell([
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [paragraph("Keep the list")],
              },
            ],
          },
          paragraph("Trailing paragraph"),
        ]),
      ]),
    ]);
    const doc = documentWithTable(richTable);
    const tablePosition = tablePositions(doc)[0]!;
    const originalTable = getTable(doc, tablePosition);
    const originalBlocks = [
      ...Array.from({ length: originalTable.firstChild!.child(0).childCount }, (_, index) =>
        originalTable.firstChild!.child(0).child(index),
      ),
      ...Array.from({ length: originalTable.firstChild!.child(1).childCount }, (_, index) =>
        originalTable.firstChild!.child(1).child(index),
      ),
    ];
    const merged = apply(
      doc,
      {
        type: "merge_cells",
        rectangle: { top: 0, left: 0, bottom: 1, right: 2 },
      },
      tablePosition,
    );
    const mergedTable = getTable(merged.transaction.doc, tablePosition);
    const mergedCell = mergedTable.firstChild!.firstChild!;

    expect(merged.before).toEqual({ rows: 1, columns: 2 });
    expect(merged.after).toEqual({ rows: 1, columns: 2 });
    expect(mergedCell.attrs).toMatchObject({ colspan: 2, rowspan: 1 });
    const mergedBlocks = Array.from({ length: mergedCell.childCount }, (_, index) =>
      mergedCell.child(index),
    );

    expect(mergedBlocks).toEqual(originalBlocks);
    mergedBlocks.forEach((block, index) => expect(block).toBe(originalBlocks[index]));
    expect(
      mergedCell.content.content.find((node) =>
        node.content.content.some((child) => child.type.name === "testConsumerReference"),
      ),
    ).toBe(originalBlocks[0]);
    expectValidTable(merged.transaction.doc, tablePosition, 1, 2);
    expectOuterSiblingIdentity(doc, merged.transaction.doc);

    const split = apply(
      merged.transaction.doc,
      { type: "split_cell", row: 0, column: 0 },
      tablePosition,
    );
    const splitRow = getTable(split.transaction.doc, tablePosition).firstChild!;
    const restoredContentCell = splitRow.child(0);
    const emptyCell = splitRow.child(1);

    expect(split.before).toEqual({ rows: 1, columns: 2 });
    expect(split.after).toEqual({ rows: 1, columns: 2 });
    expect(splitRow.childCount).toBe(2);
    expect(restoredContentCell.attrs).toMatchObject({ colspan: 1, rowspan: 1 });
    const splitBlocks = Array.from({ length: restoredContentCell.childCount }, (_, index) =>
      restoredContentCell.child(index),
    );

    expect(splitBlocks).toEqual(originalBlocks);
    splitBlocks.forEach((block, index) => expect(block).toBe(originalBlocks[index]));
    expect(emptyCell.textContent).toBe("");
    expect(emptyCell.childCount).toBe(1);
    expect(emptyCell.firstChild?.type.name).toBe("paragraph");
    expectValidTable(split.transaction.doc, tablePosition, 1, 2);
    expectOuterSiblingIdentity(merged.transaction.doc, split.transaction.doc);
  });

  it("rejects deleting the last row or last column", () => {
    const singleRow = documentWithTable(bodyTable([["A", "B"]]));
    const singleColumn = documentWithTable(bodyTable([["A"], ["B"]]));

    expect(() => apply(singleRow, { type: "delete_row", index: 0 })).toThrow(
      "The last table row cannot be deleted.",
    );
    expect(() => apply(singleColumn, { type: "delete_column", index: 0 })).toThrow(
      "The last table column cannot be deleted.",
    );
  });

  it("rejects a nested target and a table that contains a nested table", () => {
    const nestedTable = table([row([cell([paragraph("Nested")])])]);
    const doc = documentWithTable(
      table([row([cell([paragraph("Outer"), nestedTable]), cell([paragraph("Sibling")])])]),
    );
    const [outerPosition, nestedPosition] = tablePositions(doc);

    expect(outerPosition).toBeDefined();
    expect(nestedPosition).toBeDefined();
    expect(() =>
      applyTableTransformPoc(createState(doc), outerPosition!, { type: "add_row", index: 1 }),
    ).toThrow("The target table contains a nested table.");
    expect(() =>
      applyTableTransformPoc(createState(doc), nestedPosition!, { type: "add_row", index: 1 }),
    ).toThrow("A nested table cannot be transformed.");
  });

  it("rejects schema-valid but malformed table geometry", () => {
    const doc = documentWithTable(
      table([
        row([cell([paragraph("A")]), cell([paragraph("B")])]),
        row([cell([paragraph("Missing neighbor")])]),
      ]),
    );
    const tablePosition = tablePositions(doc)[0]!;

    expect(() => doc.check()).not.toThrow();
    expect(TableMap.get(getTable(doc, tablePosition)).problems).not.toBeNull();
    expect(() => apply(doc, { type: "add_row", index: 1 }, tablePosition)).toThrow(
      "The target table has malformed geometry.",
    );
  });

  it("rejects a merge rectangle that partially crosses an existing span", () => {
    const doc = documentWithTable(
      table([
        row([cell([paragraph("Wide")], { colspan: 2 }), cell([paragraph("Right")])]),
        row([cell([paragraph("A")]), cell([paragraph("B")]), cell([paragraph("C")])]),
      ]),
    );

    expect(() =>
      apply(doc, {
        type: "merge_cells",
        rectangle: { top: 0, left: 0, bottom: 2, right: 1 },
      }),
    ).toThrow("The merge rectangle partially crosses an existing cell span.");
  });

  it("rejects merging header and body cells", () => {
    const doc = documentWithTable(
      table([
        row([
          cell([paragraph("Header A")], { type: "tableHeader" }),
          cell([paragraph("Header B")], { type: "tableHeader" }),
        ]),
        row([cell([paragraph("Body A")]), cell([paragraph("Body B")])]),
      ]),
    );

    expect(() =>
      apply(doc, {
        type: "merge_cells",
        rectangle: { top: 0, left: 0, bottom: 2, right: 1 },
      }),
    ).toThrow("Header and body cells cannot be merged together.");
  });

  it("rejects splitting an ordinary unmerged cell", () => {
    const doc = documentWithTable(bodyTable([["A", "B"]]));

    expect(() => apply(doc, { type: "split_cell", row: 0, column: 0 })).toThrow(
      "The selected cell is not merged and cannot be split.",
    );
  });
});
