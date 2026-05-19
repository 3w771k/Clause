// Helpers de transition operation legacy → viewType (Brief 7).
// Sortis ici car partagés entre analyses.ts et analysis-operations.ts.

const OP_TO_VIEW: Record<string, string> = {
  alignment: 'comparison',
  confrontation: 'audit',
  tabular: 'tabular',
  contract_draft: 'contract_draft',
  multi_doc_redline: 'multi_doc_redline',
  template_contract: 'template_contract',
};

export function mapOperationToViewType(op: string | null | undefined): string {
  return OP_TO_VIEW[op ?? ''] ?? 'tabular';
}

export function withViewType<T extends { operation: string; viewType: string | null }>(row: T) {
  return {
    ...row,
    viewType: row.viewType ?? mapOperationToViewType(row.operation),
    legacyOperation: row.operation,
  };
}
