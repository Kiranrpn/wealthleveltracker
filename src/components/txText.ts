import type { Bucket, Transaction, TxKind } from "../lib/types";

export const KIND_LABEL: Record<TxKind, string> = {
  INCOME: "Income",
  TRANSFER: "Move",
  SPEND: "Spend",
  ADJUST: "Adjust",
};

export function describeTx(tx: Transaction, labels: Record<Bucket, string>): string {
  switch (tx.kind) {
    case "INCOME":
      return tx.source;
    case "TRANSFER":
      return `${labels[tx.postings[0].bucket]} → ${labels[tx.postings[1].bucket]}`;
    case "SPEND":
      return tx.category || `Spend from ${labels[tx.postings[0].bucket]}`;
    case "ADJUST":
      return tx.notes || `${labels[tx.postings[0].bucket]} adjustment`;
  }
}
