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
} from "@tiptap/pm/tables";

export type TableRectangle = {
  top: number;
  left: number;
  bottom: number;
  right: number;
};

export type TableTransformOperation =
  | { type: "add_row"; index: number }
  | { type: "delete_row"; index: number }
  | { type: "add_column"; index: number }
  | { type: "delete_column"; index: number }
  | { type: "merge_cells"; rectangle: TableRectangle }
  | { type: "split_cell"; row: number; column: number };

export type TableGeometry = {
  rows: number;
  columns: number;
};

export type TableTransformResult = {
  transaction: Transaction;
  before: TableGeometry;
  after: TableGeometry;
};

const getGeometry = (map: TableMap): TableGeometry => ({
  rows: map.height,
  columns: map.width,
});

const assertIntegerInRange = (value: number, minimum: number, maximum: number, label: string) => {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
};

const assertTableHasNoTableDescendant = (table: ProseMirrorNode) => {
  let nestedTable = false;

  table.descendants((node) => {
    if (node.type.spec.tableRole === "table") {
      nestedTable = true;
      return false;
    }
  });

  if (nestedTable) {
    throw new RangeError("The target table contains a nested table.");
  }
};

const resolveTable = (state: EditorState, tablePosition: number) => {
  assertIntegerInRange(tablePosition, 0, state.doc.content.size, "Table position");

  const table = state.doc.nodeAt(tablePosition);

  if (table?.type.spec.tableRole !== "table") {
    throw new RangeError("The target position does not point to a table.");
  }

  const $tablePosition = state.doc.resolve(tablePosition);

  for (let depth = $tablePosition.depth; depth > 0; depth -= 1) {
    if ($tablePosition.node(depth).type.spec.tableRole === "table") {
      throw new RangeError("A nested table cannot be transformed.");
    }
  }

  assertTableHasNoTableDescendant(table);

  const map = TableMap.get(table);

  if (map.problems) {
    throw new RangeError("The target table has malformed geometry.");
  }

  return {
    map,
    table,
    tableStart: tablePosition + 1,
  };
};

const assertRectangle = (rectangle: TableRectangle, map: TableMap) => {
  assertIntegerInRange(rectangle.top, 0, map.height - 1, "Rectangle top");
  assertIntegerInRange(rectangle.left, 0, map.width - 1, "Rectangle left");
  assertIntegerInRange(rectangle.bottom, 1, map.height, "Rectangle bottom");
  assertIntegerInRange(rectangle.right, 1, map.width, "Rectangle right");

  if (rectangle.bottom <= rectangle.top || rectangle.right <= rectangle.left) {
    throw new RangeError("The merge rectangle must have a positive width and height.");
  }
};

const sameRectangle = (left: TableRectangle, right: TableRectangle) =>
  left.top === right.top &&
  left.left === right.left &&
  left.bottom === right.bottom &&
  left.right === right.right;

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
  const applied = command(state, (nextTransaction) => {
    transaction = nextTransaction;
  });

  if (!applied || !transaction?.docChanged) {
    throw new RangeError(unavailableMessage);
  }

  return transaction;
};

const applyMerge = (
  state: EditorState,
  table: ProseMirrorNode,
  map: TableMap,
  tableStart: number,
  rectangle: TableRectangle,
) => {
  assertRectangle(rectangle, map);

  const anchorCell = cellPositionAt(map, rectangle.top, rectangle.left);
  const headCell = cellPositionAt(map, rectangle.bottom - 1, rectangle.right - 1);
  const selectedRectangle = map.rectBetween(anchorCell, headCell);

  if (!sameRectangle(rectangle, selectedRectangle)) {
    throw new RangeError("The merge rectangle partially crosses an existing cell span.");
  }

  const cellRoles = new Set<string>();

  for (const cellPosition of map.cellsInRect(rectangle)) {
    const cell = table.nodeAt(cellPosition);

    if (!cell) {
      throw new RangeError("The merge rectangle contains an unresolved cell.");
    }

    cellRoles.add(String(cell.type.spec.tableRole));
  }

  if (cellRoles.size !== 1) {
    throw new RangeError("Header and body cells cannot be merged together.");
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
  map: TableMap,
  tableStart: number,
  row: number,
  column: number,
) => {
  assertIntegerInRange(row, 0, map.height - 1, "Cell row");
  assertIntegerInRange(column, 0, map.width - 1, "Cell column");

  const cellPosition = cellPositionAt(map, row, column);
  const selectedState = createCellSelectionState(state, tableStart, cellPosition);

  return captureCommandTransaction(
    splitCell,
    selectedState,
    "The selected cell is not merged and cannot be split.",
  );
};

const assertExpectedGeometry = (
  operation: TableTransformOperation,
  before: TableGeometry,
  after: TableGeometry,
) => {
  const expected = { ...before };

  if (operation.type === "add_row") {
    expected.rows += 1;
  } else if (operation.type === "delete_row") {
    expected.rows -= 1;
  } else if (operation.type === "add_column") {
    expected.columns += 1;
  } else if (operation.type === "delete_column") {
    expected.columns -= 1;
  }

  if (after.rows !== expected.rows || after.columns !== expected.columns) {
    throw new RangeError("The table transform produced unexpected geometry.");
  }
};

/**
 * Test-only proof that Scribe table geometry can be changed without an EditorView or DOM.
 * Application authorization, revision checks, destructive previews, and Yjs persistence remain
 * outside this kernel.
 */
export const applyTableTransformPoc = (
  state: EditorState,
  tablePosition: number,
  operation: TableTransformOperation,
): TableTransformResult => {
  state.doc.check();

  const { map, table, tableStart } = resolveTable(state, tablePosition);
  const before = getGeometry(map);
  let transaction: Transaction;

  if (operation.type === "add_row") {
    assertIntegerInRange(operation.index, 0, map.height, "Row insertion index");
    transaction = addRow(state.tr, { map, table, tableStart }, operation.index);
  } else if (operation.type === "delete_row") {
    if (map.height === 1) {
      throw new RangeError("The last table row cannot be deleted.");
    }

    assertIntegerInRange(operation.index, 0, map.height - 1, "Row index");
    transaction = state.tr;
    removeRow(transaction, { map, table, tableStart }, operation.index);
  } else if (operation.type === "add_column") {
    assertIntegerInRange(operation.index, 0, map.width, "Column insertion index");
    transaction = addColumn(state.tr, { map, table, tableStart }, operation.index);
  } else if (operation.type === "delete_column") {
    if (map.width === 1) {
      throw new RangeError("The last table column cannot be deleted.");
    }

    assertIntegerInRange(operation.index, 0, map.width - 1, "Column index");
    transaction = state.tr;
    removeColumn(transaction, { map, table, tableStart }, operation.index);
  } else if (operation.type === "merge_cells") {
    transaction = applyMerge(state, table, map, tableStart, operation.rectangle);
  } else {
    transaction = applySplit(state, map, tableStart, operation.row, operation.column);
  }

  if (!transaction.docChanged) {
    throw new RangeError("The table transform did not change the document.");
  }

  transaction.doc.check();

  const transformed = resolveTable(
    EditorState.create({ schema: state.schema, doc: transaction.doc }),
    transaction.mapping.map(tablePosition, -1),
  );
  const after = getGeometry(transformed.map);

  assertExpectedGeometry(operation, before, after);

  return { transaction, before, after };
};
