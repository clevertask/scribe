import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { ScribeProps } from "..";

export const tableConfig = {
  init: (props: ScribeProps) =>
    Table.configure({
      resizable: props.editable,
    }),
  complements: [TableRow, TableHeader, TableCell],
};
