// @vitest-environment node

import { getSchema, Node as TiptapNode, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TableMap } from "@tiptap/pm/tables";
import { describe, expect, it } from "vitest";
import { createScribeSchemaExtensions } from "../lib/schema";
import {
  applyScribeTableTransform,
  ScribeTableTransformError,
  type ScribeTableTransformErrorCode,
  type ScribeTableTransformOperation,
} from "../lib/table-transforms";

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
    colwidth?: number[] | null;
    align?: "left" | "center" | "right" | null;
  } = {},
): JSONContent => ({
  type: options.type ?? "tableCell",
  attrs: {
    colspan: options.colspan ?? 1,
    rowspan: options.rowspan ?? 1,
    colwidth: options.colwidth ?? null,
    align: options.align ?? null,
  },
  content,
});

const row = (cells: JSONContent[]): JSONContent => ({ type: "tableRow", content: cells });

const table = (rows: JSONContent[]): JSONContent => ({ type: "table", content: rows });

const bodyTable = (rows: string[][]): JSONContent =>
  table(rows.map((values) => row(values.map((value) => cell([paragraph(value)])))));

const documentWithBlocks = (...content: JSONContent[]): ProseMirrorNode =>
  schema.nodeFromJSON({ type: "doc", content });

const documentWithTable = (tableContent: JSONContent): ProseMirrorNode =>
  documentWithBlocks(paragraph("Before"), tableContent, paragraph("After"));

const tablePositions = (document: ProseMirrorNode) => {
  const positions: number[] = [];

  document.descendants((node, position) => {
    if (node.type.spec.tableRole === "table") positions.push(position);
  });

  return positions;
};

const getTable = (document: ProseMirrorNode, position: number) => {
  const tableNode = document.nodeAt(position);

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

const apply = (
  document: ProseMirrorNode,
  operation: ScribeTableTransformOperation,
  tablePosition = tablePositions(document)[0],
) => {
  if (tablePosition === undefined) throw new Error("Expected a table fixture.");

  return applyScribeTableTransform(document, tablePosition, operation);
};

const expectValidTable = (
  document: ProseMirrorNode,
  tablePosition: number,
  rows: number,
  columns: number,
) => {
  expect(() => document.check()).not.toThrow();
  const map = TableMap.get(getTable(document, tablePosition));

  expect(map.problems).toBeNull();
  expect({ rows: map.height, columns: map.width }).toEqual({ rows, columns });
};

const expectTransformError = (
  callback: () => unknown,
  code: ScribeTableTransformErrorCode,
  message?: string,
) => {
  try {
    callback();
    throw new Error("Expected the table transform to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(ScribeTableTransformError);
    expect((error as ScribeTableTransformError).code).toBe(code);
    if (message) expect((error as Error).message).toContain(message);
  }
};

describe("applyScribeTableTransform", () => {
  it("runs without a DOM and returns the transformed document and physical geometry", () => {
    expect(globalThis.document).toBeUndefined();

    const document = documentWithTable(bodyTable([["A", "B"]]));
    const tablePosition = tablePositions(document)[0]!;
    const result = apply(document, { type: "insert_row", index: 1 }, tablePosition);

    expect(result).not.toHaveProperty("transaction");
    expect(result.document).not.toBe(document);
    expect(result.tablePosition).toBe(tablePosition);
    expect(result.before).toEqual({ rows: 1, columns: 2, physicalCells: 2 });
    expect(result.after).toEqual({ rows: 2, columns: 2, physicalCells: 4 });
    expectValidTable(result.document, result.tablePosition, 2, 2);
    expect(result.document.firstChild).toBe(document.firstChild);
    expect(result.document.lastChild).toBe(document.lastChild);
  });

  it.each([0, 1, 2, 3])("inserts a row at exact boundary %i", (index) => {
    const original = [
      ["A1", "A2"],
      ["B1", "B2"],
      ["C1", "C2"],
    ];
    const document = documentWithTable(bodyTable(original));
    const result = apply(document, { type: "insert_row", index });
    const expected = [...original];

    expected.splice(index, 0, ["", ""]);
    expect(tableTextGrid(getTable(result.document, result.tablePosition))).toEqual(expected);
    expectValidTable(result.document, result.tablePosition, 4, 2);
  });

  it.each([0, 1, 2])("deletes exact row %i", (index) => {
    const original = [
      ["A1", "A2"],
      ["B1", "B2"],
      ["C1", "C2"],
    ];
    const document = documentWithTable(bodyTable(original));
    const result = apply(document, { type: "delete_row", index });

    expect(tableTextGrid(getTable(result.document, result.tablePosition))).toEqual(
      original.filter((_, rowIndex) => rowIndex !== index),
    );
    expectValidTable(result.document, result.tablePosition, 2, 2);
  });

  it.each([0, 1, 2])("inserts a column at exact boundary %i", (index) => {
    const original = [
      ["A1", "A2"],
      ["B1", "B2"],
    ];
    const document = documentWithTable(bodyTable(original));
    const result = apply(document, { type: "insert_column", index });
    const expected = original.map((values) => {
      const next = [...values];
      next.splice(index, 0, "");
      return next;
    });

    expect(tableTextGrid(getTable(result.document, result.tablePosition))).toEqual(expected);
    expectValidTable(result.document, result.tablePosition, 2, 3);
  });

  it.each([0, 1])("deletes exact column %i", (index) => {
    const original = [
      ["A1", "A2"],
      ["B1", "B2"],
    ];
    const document = documentWithTable(bodyTable(original));
    const result = apply(document, { type: "delete_column", index });

    expect(tableTextGrid(getTable(result.document, result.tablePosition))).toEqual(
      original.map((values) => values.filter((_, columnIndex) => columnIndex !== index)),
    );
    expectValidTable(result.document, result.tablePosition, 2, 1);
  });

  it("targets the requested sibling table without changing the other table or outer blocks", () => {
    const document = documentWithBlocks(
      paragraph("Before"),
      bodyTable([["First"]]),
      paragraph("Between"),
      bodyTable([["Second A", "Second B"]]),
      paragraph("After"),
    );
    const [firstPosition, secondPosition] = tablePositions(document);
    const firstTable = getTable(document, firstPosition!);
    const result = apply(document, { type: "insert_row", index: 1 }, secondPosition!);

    expect(result.tablePosition).toBe(secondPosition);
    expect(getTable(result.document, firstPosition!)).toBe(firstTable);
    expect(tableTextGrid(getTable(result.document, result.tablePosition))).toEqual([
      ["Second A", "Second B"],
      ["", ""],
    ]);
    expect(result.document.firstChild).toBe(document.firstChild);
    expect(result.document.lastChild).toBe(document.lastChild);
  });

  it.each([
    { type: "insert_row", index: 1 },
    { type: "delete_row", index: 0 },
    { type: "insert_column", index: 1 },
    { type: "delete_column", index: 1 },
    {
      type: "merge_cells",
      rectangle: { topRow: 0, leftColumn: 0, bottomRowExclusive: 1, rightColumnExclusive: 2 },
    },
  ] satisfies ScribeTableTransformOperation[])(
    "retains saved table preferences through $type without a DOM",
    (operation) => {
      const preferences = {
        tableLayout: "scroll",
        limitHeight: true,
        maxHeight: 600,
        stickyHeaderRow: true,
      };
      const originalTable = table([
        row([
          cell([paragraph("Project")], { type: "tableHeader" }),
          cell([paragraph("Owner")], { type: "tableHeader" }),
        ]),
        row([cell([paragraph("Scribe")]), cell([paragraph("Roberto")])]),
      ]);
      const document = documentWithTable({ ...originalTable, attrs: preferences });
      const result = apply(document, operation);
      expect(globalThis.document).toBeUndefined();
      expect(getTable(result.document, result.tablePosition).attrs).toEqual(preferences);
      expect(() => result.document.check()).not.toThrow();
      if (operation.type === "merge_cells") {
        const split = apply(
          result.document,
          { type: "split_cell", row: 0, column: 0 },
          result.tablePosition,
        );
        expect(getTable(split.document, split.tablePosition).attrs).toEqual(preferences);
        expect(() => split.document.check()).not.toThrow();
      }
    },
  );

  it("inserts and deletes through existing row and column spans", () => {
    const rowSpanDocument = documentWithTable(
      table([
        row([cell([paragraph("Tall")], { rowspan: 2 }), cell([paragraph("Top right")])]),
        row([cell([paragraph("Bottom right")])]),
      ]),
    );
    const insertedRow = apply(rowSpanDocument, { type: "insert_row", index: 1 });
    const insertedRowTable = getTable(insertedRow.document, insertedRow.tablePosition);

    expect(insertedRowTable.firstChild!.firstChild!.attrs.rowspan).toBe(3);
    expect(insertedRowTable.child(1).childCount).toBe(1);
    expect(insertedRow.before).toEqual({ rows: 2, columns: 2, physicalCells: 3 });
    expect(insertedRow.after).toEqual({ rows: 3, columns: 2, physicalCells: 4 });
    const restoredRows = apply(
      insertedRow.document,
      { type: "delete_row", index: 1 },
      insertedRow.tablePosition,
    );
    expect(restoredRows.document.eq(rowSpanDocument)).toBe(true);

    const columnSpanDocument = documentWithTable(
      table([
        row([cell([paragraph("Wide")], { colspan: 2 })]),
        row([cell([paragraph("Left")]), cell([paragraph("Right")])]),
      ]),
    );
    const insertedColumn = apply(columnSpanDocument, { type: "insert_column", index: 1 });
    const insertedColumnTable = getTable(insertedColumn.document, insertedColumn.tablePosition);

    expect(insertedColumnTable.firstChild!.firstChild!.attrs.colspan).toBe(3);
    expect(insertedColumnTable.child(1).childCount).toBe(3);
    const restoredColumns = apply(
      insertedColumn.document,
      { type: "delete_column", index: 1 },
      insertedColumn.tablePosition,
    );
    expect(restoredColumns.document.eq(columnSpanDocument)).toBe(true);
  });

  it("preserves cell attrs, rich blocks, and consumer nodes through merge and split", () => {
    const document = documentWithTable(
      table([
        row([
          cell(
            [
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
            ],
            { align: "right", colwidth: [140] },
          ),
          cell(
            [
              {
                type: "bulletList",
                content: [{ type: "listItem", content: [paragraph("Keep the list")] }],
              },
              paragraph("Trailing paragraph"),
            ],
            { colwidth: [160] },
          ),
        ]),
      ]),
    );
    const tablePosition = tablePositions(document)[0]!;
    const originalRow = getTable(document, tablePosition).firstChild!;
    const originalBlocks = [
      ...Array.from({ length: originalRow.child(0).childCount }, (_, index) =>
        originalRow.child(0).child(index),
      ),
      ...Array.from({ length: originalRow.child(1).childCount }, (_, index) =>
        originalRow.child(1).child(index),
      ),
    ];
    const merged = apply(
      document,
      {
        type: "merge_cells",
        rectangle: {
          topRow: 0,
          leftColumn: 0,
          bottomRowExclusive: 1,
          rightColumnExclusive: 2,
        },
      },
      tablePosition,
    );
    const mergedCell = getTable(merged.document, merged.tablePosition).firstChild!.firstChild!;

    expect(merged.before).toEqual({ rows: 1, columns: 2, physicalCells: 2 });
    expect(merged.after).toEqual({ rows: 1, columns: 2, physicalCells: 1 });
    expect(mergedCell.attrs).toMatchObject({
      colspan: 2,
      rowspan: 1,
      align: "right",
    });
    expect(mergedCell.attrs.colwidth).toHaveLength(2);
    expect(mergedCell.attrs.colwidth[0]).toBe(140);
    expect(
      Array.from({ length: mergedCell.childCount }, (_, index) => mergedCell.child(index)),
    ).toEqual(originalBlocks);

    const split = apply(
      merged.document,
      { type: "split_cell", row: 0, column: 0 },
      merged.tablePosition,
    );
    const splitRow = getTable(split.document, split.tablePosition).firstChild!;

    expect(split.before).toEqual({ rows: 1, columns: 2, physicalCells: 1 });
    expect(split.after).toEqual({ rows: 1, columns: 2, physicalCells: 2 });
    expect(splitRow.child(0).attrs).toMatchObject({
      colspan: 1,
      rowspan: 1,
      align: "right",
      colwidth: [140],
    });
    expect(splitRow.child(1).attrs.colwidth).toBeNull();
    expect(splitRow.child(1).textContent).toBe("");
    expect(splitRow.child(1).firstChild?.type.name).toBe("paragraph");
    expect(
      Array.from({ length: splitRow.child(0).childCount }, (_, index) =>
        splitRow.child(0).child(index),
      ),
    ).toEqual(originalBlocks);
  });

  it("splits a two-dimensional merged cell only from its top-left coordinate", () => {
    const mergedDocument = documentWithTable(
      table([
        row([cell([paragraph("Merged")], { colspan: 2, rowspan: 2, align: "center" })]),
        row([]),
      ]),
    );

    expectTransformError(
      () => apply(mergedDocument, { type: "split_cell", row: 1, column: 1 }),
      "operation_not_applicable",
      "top-left",
    );

    const split = apply(mergedDocument, { type: "split_cell", row: 0, column: 0 });
    const splitTable = getTable(split.document, split.tablePosition);

    expect(split.before).toEqual({ rows: 2, columns: 2, physicalCells: 1 });
    expect(split.after).toEqual({ rows: 2, columns: 2, physicalCells: 4 });
    expect(splitTable.child(0).child(0).textContent).toBe("Merged");
    expect(splitTable.child(0).child(0).attrs.align).toBe("center");
    expectValidTable(split.document, split.tablePosition, 2, 2);
  });

  it("rejects malformed runtime inputs with stable invalid_input and invalid_target codes", () => {
    const document = documentWithTable(bodyTable([["A", "B"]]));
    const tablePosition = tablePositions(document)[0]!;
    const invalidOperations: unknown[] = [
      null,
      { type: "unknown" },
      { type: "insert_row", index: 1, unexpected: true },
      { type: "insert_row", index: 0.5 },
      { type: "insert_column", index: Number.NaN },
      { type: "delete_row", index: 9 },
      {
        type: "merge_cells",
        rectangle: {
          topRow: 0,
          leftColumn: 0,
          bottomRowExclusive: 1,
          rightColumnExclusive: 2,
          inclusive: true,
        },
      },
    ];

    for (const operation of invalidOperations) {
      expectTransformError(
        () =>
          applyScribeTableTransform(
            document,
            tablePosition,
            operation as ScribeTableTransformOperation,
          ),
        "invalid_input",
      );
    }

    expectTransformError(
      () => applyScribeTableTransform(document, 0.5, { type: "insert_row", index: 0 }),
      "invalid_target",
    );
    expectTransformError(
      () => applyScribeTableTransform(document, 0, { type: "insert_row", index: 0 }),
      "invalid_target",
    );
  });

  it("rejects destructive and no-op operations with operation_not_applicable", () => {
    expectTransformError(
      () => apply(documentWithTable(bodyTable([["A", "B"]])), { type: "delete_row", index: 0 }),
      "operation_not_applicable",
      "last table row",
    );
    expectTransformError(
      () =>
        apply(documentWithTable(bodyTable([["A"], ["B"]])), { type: "delete_column", index: 0 }),
      "operation_not_applicable",
      "last table column",
    );
    expectTransformError(
      () =>
        apply(documentWithTable(bodyTable([["A", "B"]])), {
          type: "split_cell",
          row: 0,
          column: 0,
        }),
      "operation_not_applicable",
      "not merged",
    );
    expectTransformError(
      () =>
        apply(documentWithTable(bodyTable([["A", "B"]])), {
          type: "merge_cells",
          rectangle: {
            topRow: 0,
            leftColumn: 0,
            bottomRowExclusive: 1,
            rightColumnExclusive: 1,
          },
        }),
      "operation_not_applicable",
      "at least two cells",
    );
  });

  it("rejects nested and malformed table structures as unsupported", () => {
    const nested = table([row([cell([paragraph("Nested")])])]);
    const nestedDocument = documentWithTable(
      table([row([cell([paragraph("Outer"), nested]), cell([paragraph("Sibling")])])]),
    );
    const [outerPosition, nestedPosition] = tablePositions(nestedDocument);

    expectTransformError(
      () =>
        applyScribeTableTransform(nestedDocument, outerPosition!, {
          type: "insert_row",
          index: 1,
        }),
      "unsupported_structure",
      "contains a nested table",
    );
    expectTransformError(
      () =>
        applyScribeTableTransform(nestedDocument, nestedPosition!, {
          type: "insert_row",
          index: 1,
        }),
      "unsupported_structure",
      "nested table cannot",
    );

    const malformedDocument = documentWithTable(
      table([
        row([cell([paragraph("A")]), cell([paragraph("B")])]),
        row([cell([paragraph("Missing neighbor")])]),
      ]),
    );

    expectTransformError(
      () => apply(malformedDocument, { type: "insert_row", index: 1 }),
      "unsupported_structure",
      "malformed geometry",
    );
  });

  it("rejects partial-span and mixed-role merge rectangles", () => {
    const spanDocument = documentWithTable(
      table([
        row([cell([paragraph("Wide")], { colspan: 2 }), cell([paragraph("Right")])]),
        row([cell([paragraph("A")]), cell([paragraph("B")]), cell([paragraph("C")])]),
      ]),
    );

    expectTransformError(
      () =>
        apply(spanDocument, {
          type: "merge_cells",
          rectangle: {
            topRow: 0,
            leftColumn: 0,
            bottomRowExclusive: 2,
            rightColumnExclusive: 1,
          },
        }),
      "operation_not_applicable",
      "partially crosses",
    );

    const mixedRoleDocument = documentWithTable(
      table([
        row([
          cell([paragraph("Header A")], { type: "tableHeader" }),
          cell([paragraph("Header B")], { type: "tableHeader" }),
        ]),
        row([cell([paragraph("Body A")]), cell([paragraph("Body B")])]),
      ]),
    );

    expectTransformError(
      () =>
        apply(mixedRoleDocument, {
          type: "merge_cells",
          rectangle: {
            topRow: 0,
            leftColumn: 0,
            bottomRowExclusive: 2,
            rightColumnExclusive: 1,
          },
        }),
      "operation_not_applicable",
      "Header and body",
    );
  });
});
