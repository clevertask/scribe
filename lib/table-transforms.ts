import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import {
  addColumn,
  addRow,
  CellSelection,
  mergeCells,
  removeColumn,
  removeRow,
  splitCell,
  TableMap,
  type Rect,
  type TableRect,
} from "@tiptap/pm/tables";

export type ScribeTableTransformErrorCode =
  | "invalid_input"
  | "invalid_target"
  | "unsupported_structure"
  | "operation_not_applicable"
  | "invalid_result";

export class ScribeTableTransformError extends Error {
  readonly code: ScribeTableTransformErrorCode;
  readonly cause?: unknown;

  constructor(code: ScribeTableTransformErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "ScribeTableTransformError";
    this.code = code;
    this.cause = cause;
  }
}

/**
 * A half-open logical table rectangle. The top and left coordinates are
 * included; the bottom and right coordinates are excluded.
 */
export type ScribeTableMergeRectangle = Readonly<{
  topRow: number;
  leftColumn: number;
  bottomRowExclusive: number;
  rightColumnExclusive: number;
}>;

export type ScribeTableTransformOperation =
  | Readonly<{ type: "insert_row"; index: number }>
  | Readonly<{ type: "delete_row"; index: number }>
  | Readonly<{ type: "insert_column"; index: number }>
  | Readonly<{ type: "delete_column"; index: number }>
  | Readonly<{ type: "merge_cells"; rectangle: ScribeTableMergeRectangle }>
  | Readonly<{ type: "split_cell"; row: number; column: number }>;

export type ScribeTableGeometry = Readonly<{
  rows: number;
  columns: number;
  physicalCells: number;
}>;

export type ScribeTableTransformResult = Readonly<{
  document: ProseMirrorNode;
  tablePosition: number;
  before: ScribeTableGeometry;
  after: ScribeTableGeometry;
}>;

type ResolvedTable = TableRect;

const fail = (code: ScribeTableTransformErrorCode, message: string, cause?: unknown): never => {
  throw new ScribeTableTransformError(code, message, cause);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();

  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const assertExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
) => {
  if (!hasExactKeys(value, keys)) {
    fail("invalid_input", `${label} must contain exactly: ${keys.join(", ")}.`);
  }
};

const assertIntegerInRange = (value: unknown, minimum: number, maximum: number, label: string) => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    fail("invalid_input", `${label} must be an integer from ${minimum} to ${maximum}.`);
  }
};

const parseOperation = (value: unknown): ScribeTableTransformOperation => {
  if (!isRecord(value)) {
    fail("invalid_input", "The table operation must be an object with a supported type.");
  }

  const operation = value as Record<string, unknown>;

  if (typeof operation.type !== "string") {
    fail("invalid_input", "The table operation must be an object with a supported type.");
  }

  if (
    operation.type === "insert_row" ||
    operation.type === "delete_row" ||
    operation.type === "insert_column" ||
    operation.type === "delete_column"
  ) {
    assertExactKeys(operation, ["type", "index"], "The table operation");

    if (typeof operation.index !== "number") {
      fail("invalid_input", "The table operation index must be a number.");
    }

    return { type: operation.type, index: operation.index as number };
  }

  if (operation.type === "merge_cells") {
    assertExactKeys(operation, ["type", "rectangle"], "The merge operation");

    if (!isRecord(operation.rectangle)) {
      fail("invalid_input", "The merge rectangle must be an object.");
    }

    const rectangle = operation.rectangle as Record<string, unknown>;

    assertExactKeys(
      rectangle,
      ["topRow", "leftColumn", "bottomRowExclusive", "rightColumnExclusive"],
      "The merge rectangle",
    );

    const { topRow, leftColumn, bottomRowExclusive, rightColumnExclusive } = rectangle;

    if (
      typeof topRow !== "number" ||
      typeof leftColumn !== "number" ||
      typeof bottomRowExclusive !== "number" ||
      typeof rightColumnExclusive !== "number"
    ) {
      fail("invalid_input", "Every merge rectangle coordinate must be a number.");
    }

    return {
      type: "merge_cells",
      rectangle: {
        topRow: topRow as number,
        leftColumn: leftColumn as number,
        bottomRowExclusive: bottomRowExclusive as number,
        rightColumnExclusive: rightColumnExclusive as number,
      },
    };
  }

  if (operation.type === "split_cell") {
    assertExactKeys(operation, ["type", "row", "column"], "The split operation");

    if (typeof operation.row !== "number" || typeof operation.column !== "number") {
      fail("invalid_input", "The split cell row and column must be numbers.");
    }

    return {
      type: "split_cell",
      row: operation.row as number,
      column: operation.column as number,
    };
  }

  return fail("invalid_input", `Unsupported table operation type: ${String(operation.type)}.`);
};

const assertValidDocument = (document: ProseMirrorNode) => {
  if (
    typeof document !== "object" ||
    document === null ||
    typeof document.check !== "function" ||
    typeof document.nodeAt !== "function" ||
    typeof document.resolve !== "function"
  ) {
    fail("invalid_input", "The document must be a ProseMirror document node.");
  }

  try {
    document.check();
  } catch (error) {
    fail("unsupported_structure", "The document has an invalid ProseMirror structure.", error);
  }
};

const assertTableHasNoTableDescendant = (table: ProseMirrorNode) => {
  let nestedTable = false;

  table.descendants((node) => {
    if (node.type.spec.tableRole === "table") {
      nestedTable = true;
      return false;
    }

    return undefined;
  });

  if (nestedTable) {
    fail("unsupported_structure", "The target table contains a nested table.");
  }
};

const resolveTable = (document: ProseMirrorNode, tablePosition: number): ResolvedTable => {
  if (
    !Number.isInteger(tablePosition) ||
    tablePosition < 0 ||
    tablePosition > document.content.size
  ) {
    fail("invalid_target", `Table position must be an integer from 0 to ${document.content.size}.`);
  }

  const table = document.nodeAt(tablePosition);

  if (table?.type.spec.tableRole !== "table") {
    fail("invalid_target", "The target position does not point to a table.");
  }

  const resolvedTable = table as ProseMirrorNode;

  const $tablePosition = document.resolve(tablePosition);

  for (let depth = $tablePosition.depth; depth > 0; depth -= 1) {
    if ($tablePosition.node(depth).type.spec.tableRole === "table") {
      fail("unsupported_structure", "A nested table cannot be transformed.");
    }
  }

  assertTableHasNoTableDescendant(resolvedTable);

  let map: TableMap | undefined;

  try {
    map = TableMap.get(resolvedTable);
  } catch (error) {
    fail("unsupported_structure", "The target table geometry could not be resolved.", error);
  }

  if (!map) {
    fail("unsupported_structure", "The target table geometry could not be resolved.");
  }

  const resolvedMap = map as TableMap;

  if (resolvedMap.problems && resolvedMap.problems.length > 0) {
    fail("unsupported_structure", "The target table has malformed geometry.");
  }

  return {
    table: resolvedTable,
    map: resolvedMap,
    tableStart: tablePosition + 1,
    top: 0,
    left: 0,
    bottom: resolvedMap.height,
    right: resolvedMap.width,
  };
};

const countPhysicalCells = (table: ProseMirrorNode) => {
  let physicalCells = 0;

  table.forEach((row) => {
    physicalCells += row.childCount;
  });

  return physicalCells;
};

const getGeometry = (table: ProseMirrorNode, map: TableMap): ScribeTableGeometry => ({
  rows: map.height,
  columns: map.width,
  physicalCells: countPhysicalCells(table),
});

const cellPositionAt = (map: TableMap, row: number, column: number) =>
  map.map[row * map.width + column];

const createCellSelectionState = (
  state: EditorState,
  tableStart: number,
  anchorCell: number,
  headCell: number = anchorCell,
) =>
  state.apply(
    state.tr.setSelection(
      CellSelection.create(state.doc, tableStart + anchorCell, tableStart + headCell),
    ),
  );

const captureCommandTransaction = (
  command: (state: EditorState, dispatch?: (transaction: Transaction) => void) => boolean,
  state: EditorState,
  unavailableMessage: string,
) => {
  let transaction: Transaction | undefined;

  let applied = false;

  try {
    applied = command(state, (nextTransaction) => {
      transaction = nextTransaction;
    });
  } catch (error) {
    fail("invalid_result", "The table command failed while producing a transaction.", error);
  }

  if (!applied || !transaction?.docChanged) {
    fail("operation_not_applicable", unavailableMessage);
  }

  return transaction as Transaction;
};

const toTableRect = (rectangle: ScribeTableMergeRectangle): Rect => ({
  top: rectangle.topRow,
  left: rectangle.leftColumn,
  bottom: rectangle.bottomRowExclusive,
  right: rectangle.rightColumnExclusive,
});

const assertMergeRectangle = (rectangle: ScribeTableMergeRectangle, map: TableMap): Rect => {
  assertIntegerInRange(rectangle.topRow, 0, map.height - 1, "Merge top row");
  assertIntegerInRange(rectangle.leftColumn, 0, map.width - 1, "Merge left column");
  assertIntegerInRange(rectangle.bottomRowExclusive, 1, map.height, "Merge exclusive bottom row");
  assertIntegerInRange(
    rectangle.rightColumnExclusive,
    1,
    map.width,
    "Merge exclusive right column",
  );

  if (
    rectangle.bottomRowExclusive <= rectangle.topRow ||
    rectangle.rightColumnExclusive <= rectangle.leftColumn
  ) {
    fail("invalid_input", "The merge rectangle must have a positive width and height.");
  }

  return toTableRect(rectangle);
};

const sameRectangle = (left: Rect, right: Rect) =>
  left.top === right.top &&
  left.left === right.left &&
  left.bottom === right.bottom &&
  left.right === right.right;

const applyMerge = (
  state: EditorState,
  table: ProseMirrorNode,
  map: TableMap,
  tableStart: number,
  rectangle: ScribeTableMergeRectangle,
) => {
  const tableRectangle = assertMergeRectangle(rectangle, map);
  const anchorCell = cellPositionAt(map, tableRectangle.top, tableRectangle.left);
  const headCell = cellPositionAt(map, tableRectangle.bottom - 1, tableRectangle.right - 1);
  const selectedRectangle = map.rectBetween(anchorCell, headCell);

  if (!sameRectangle(tableRectangle, selectedRectangle)) {
    fail(
      "operation_not_applicable",
      "The merge rectangle partially crosses an existing cell span.",
    );
  }

  const selectedCellPositions = map.cellsInRect(tableRectangle);

  if (selectedCellPositions.length < 2) {
    fail("operation_not_applicable", "The merge rectangle must contain at least two cells.");
  }

  const cellRoles = new Set<string>();

  for (const cellPosition of selectedCellPositions) {
    const cell = table.nodeAt(cellPosition);

    if (!cell) {
      fail("unsupported_structure", "The merge rectangle contains an unresolved cell.");
    }

    cellRoles.add(String((cell as ProseMirrorNode).type.spec.tableRole));
  }

  if (cellRoles.size !== 1) {
    fail("operation_not_applicable", "Header and body cells cannot be merged together.");
  }

  const selectedState = createCellSelectionState(state, tableStart, anchorCell, headCell);

  return captureCommandTransaction(
    mergeCells,
    selectedState,
    "The selected cells do not form a mergeable rectangle.",
  );
};

const applySplit = (
  state: EditorState,
  table: ProseMirrorNode,
  map: TableMap,
  tableStart: number,
  row: number,
  column: number,
) => {
  assertIntegerInRange(row, 0, map.height - 1, "Split cell row");
  assertIntegerInRange(column, 0, map.width - 1, "Split cell column");

  const cellPosition = cellPositionAt(map, row, column);
  const cellRectangle = map.findCell(cellPosition);

  if (cellRectangle.top !== row || cellRectangle.left !== column) {
    fail("operation_not_applicable", "A merged cell must be split from its top-left coordinate.");
  }

  if (
    cellRectangle.bottom - cellRectangle.top === 1 &&
    cellRectangle.right - cellRectangle.left === 1
  ) {
    fail("operation_not_applicable", "The selected cell is not merged and cannot be split.");
  }

  if (!table.nodeAt(cellPosition)) {
    fail("unsupported_structure", "The selected merged cell could not be resolved.");
  }

  const selectedState = createCellSelectionState(state, tableStart, cellPosition);

  return captureCommandTransaction(
    splitCell,
    selectedState,
    "The selected cell is not merged and cannot be split.",
  );
};

const assertExpectedGeometry = (
  operation: ScribeTableTransformOperation,
  before: ScribeTableGeometry,
  after: ScribeTableGeometry,
) => {
  let expectedRows = before.rows;
  let expectedColumns = before.columns;

  if (operation.type === "insert_row") expectedRows += 1;
  if (operation.type === "delete_row") expectedRows -= 1;
  if (operation.type === "insert_column") expectedColumns += 1;
  if (operation.type === "delete_column") expectedColumns -= 1;

  if (after.rows !== expectedRows || after.columns !== expectedColumns) {
    fail("invalid_result", "The table transform produced unexpected logical geometry.");
  }

  if (after.physicalCells < 1) {
    fail("invalid_result", "The table transform produced a table without cells.");
  }

  if (operation.type === "merge_cells" && after.physicalCells >= before.physicalCells) {
    fail("invalid_result", "The merge did not reduce the number of physical cells.");
  }

  if (operation.type === "split_cell" && after.physicalCells <= before.physicalCells) {
    fail("invalid_result", "The split did not increase the number of physical cells.");
  }
};

/**
 * Applies one bounded table transform to a ProseMirror document without an
 * EditorView or browser DOM. `tablePosition` is the position immediately
 * before the target table node.
 *
 * Application authorization, revision checks, destructive previews, and
 * collaborative persistence remain outside this kernel.
 */
export const applyScribeTableTransform = (
  document: ProseMirrorNode,
  tablePosition: number,
  operation: ScribeTableTransformOperation,
): ScribeTableTransformResult => {
  assertValidDocument(document);
  const parsedOperation = parseOperation(operation);
  const state = EditorState.create({ schema: document.type.schema, doc: document });
  const { map, table, tableStart } = resolveTable(document, tablePosition);
  const tableRect: TableRect = {
    map,
    table,
    tableStart,
    top: 0,
    left: 0,
    bottom: map.height,
    right: map.width,
  };
  const before = getGeometry(table, map);
  let transaction: Transaction;

  if (parsedOperation.type === "insert_row") {
    assertIntegerInRange(parsedOperation.index, 0, map.height, "Row insertion index");
    transaction = addRow(state.tr, tableRect, parsedOperation.index);
  } else if (parsedOperation.type === "delete_row") {
    assertIntegerInRange(parsedOperation.index, 0, map.height - 1, "Row index");

    if (map.height === 1) {
      fail("operation_not_applicable", "The last table row cannot be deleted.");
    }

    transaction = state.tr;
    removeRow(transaction, tableRect, parsedOperation.index);
  } else if (parsedOperation.type === "insert_column") {
    assertIntegerInRange(parsedOperation.index, 0, map.width, "Column insertion index");
    transaction = addColumn(state.tr, tableRect, parsedOperation.index);
  } else if (parsedOperation.type === "delete_column") {
    assertIntegerInRange(parsedOperation.index, 0, map.width - 1, "Column index");

    if (map.width === 1) {
      fail("operation_not_applicable", "The last table column cannot be deleted.");
    }

    transaction = state.tr;
    removeColumn(transaction, tableRect, parsedOperation.index);
  } else if (parsedOperation.type === "merge_cells") {
    transaction = applyMerge(state, table, map, tableStart, parsedOperation.rectangle);
  } else {
    transaction = applySplit(
      state,
      table,
      map,
      tableStart,
      parsedOperation.row,
      parsedOperation.column,
    );
  }

  if (!transaction.docChanged) {
    fail("invalid_result", "The table transform did not change the document.");
  }

  try {
    transaction.doc.check();
  } catch (error) {
    fail("invalid_result", "The table transform produced an invalid document.", error);
  }

  const transformedTablePosition = transaction.mapping.map(tablePosition, -1);
  const transformed = resolveTable(transaction.doc, transformedTablePosition);
  const after = getGeometry(transformed.table, transformed.map);

  assertExpectedGeometry(parsedOperation, before, after);

  return {
    document: transaction.doc,
    tablePosition: transformedTablePosition,
    before,
    after,
  };
};
