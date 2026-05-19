import { z } from 'zod';

export const ASSET_TYPES = ['playbook', 'standard', 'dd_grid', 'clausier', 'tabular_workflow'] as const;
export const AssetTypeSchema = z.enum(ASSET_TYPES);
export type AssetType = z.infer<typeof AssetTypeSchema>;

const Amendable = z.object({ id: z.string().min(1) });

// ─── Playbook ─────────────────────────────────────────────────────────────────
// Format: sections[] avec clauseType + stakes + positions (idéal / repli / red flag)
const PlaybookPositionSchema = z.object({ description: z.string() });
export const PlaybookSectionSchema = z.object({
  clauseType: z.string().min(1),
  stakes: z.string().optional(),
  positions: z.object({
    ideal: PlaybookPositionSchema.optional(),
    fallback: PlaybookPositionSchema.optional(),
    redFlag: PlaybookPositionSchema.optional(),
  }).optional(),
  sourceClauseIds: z.array(z.string()).optional(),
});
export const PlaybookContentSchema = z.object({
  sections: z.array(PlaybookSectionSchema),
  scope: z.string().optional(),
  sourceDocumentName: z.string().optional(),
});

// ─── Standard ─────────────────────────────────────────────────────────────────
export const StandardClauseSchema = Amendable.extend({
  clauseTypeOntologyId: z.string().min(1),
  text: z.string().min(1),
  variantsAllowed: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export const StandardSectionSchema = Amendable.extend({
  heading: z.string().min(1),
  order: z.number().int().nonnegative(),
  clauses: z.array(StandardClauseSchema),
});
export const StandardContentSchema = z.object({
  schemaVersion: z.literal(1),
  documentType: z.string().min(1),
  sections: z.array(StandardSectionSchema),
});

// ─── DD Grid ──────────────────────────────────────────────────────────────────
export const DDQuestionSchema = Amendable.extend({
  text: z.string().min(1),
  expectedAnswerType: z.enum(['text', 'boolean', 'number', 'date']),
  redFlagCriteria: z.string().optional(),
});
export const DDThemeSchema = Amendable.extend({
  name: z.string().min(1),
  questions: z.array(DDQuestionSchema),
});
export const DDGridContentSchema = z.object({
  schemaVersion: z.literal(1),
  themes: z.array(DDThemeSchema),
});

// ─── Clausier (asset) ─────────────────────────────────────────────────────────
export const ClausierVariantSchema = Amendable.extend({
  label: z.string().min(1),
  text: z.string().min(1),
  context: z.string().optional(),
  frequency: z.number().min(0).max(1).optional(),
});
export const ClausierSectionSchema = Amendable.extend({
  clauseTypeOntologyId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  variants: z.array(ClausierVariantSchema),
});
export const ClausierAssetContentSchema = z.object({
  schemaVersion: z.literal(1),
  sections: z.array(ClausierSectionSchema),
});

// ─── Tabular Workflow ─────────────────────────────────────────────────────────
export const TabularWorkflowColumnSchema = Amendable.extend({
  label: z.string().min(1).max(200),
  question: z.string().min(1).max(2000),
  expectedType: z.enum(['text', 'number', 'date', 'boolean', 'enum']),
  enumValues: z.array(z.string()).optional(),
  order: z.number().int().nonnegative(),
});
export const TabularWorkflowContentSchema = z.object({
  schemaVersion: z.literal(1),
  applicableDocumentTypes: z.array(z.string()),
  columns: z.array(TabularWorkflowColumnSchema),
});

// ─── TS types inferred ────────────────────────────────────────────────────────
export type PlaybookSection = z.infer<typeof PlaybookSectionSchema>;
export type PlaybookContent = z.infer<typeof PlaybookContentSchema>;
export type StandardContent = z.infer<typeof StandardContentSchema>;
export type DDGridContent = z.infer<typeof DDGridContentSchema>;
export type ClausierAssetContent = z.infer<typeof ClausierAssetContentSchema>;
export type TabularWorkflowContent = z.infer<typeof TabularWorkflowContentSchema>;

// ─── Dispatcher ───────────────────────────────────────────────────────────────
export function schemaForType(type: string) {
  switch (type) {
    case 'playbook': return PlaybookContentSchema;
    case 'standard': return StandardContentSchema;
    case 'dd_grid': return DDGridContentSchema;
    case 'clausier': return ClausierAssetContentSchema;
    case 'tabular_workflow': return TabularWorkflowContentSchema;
    default: return null;
  }
}

export function validateContent(type: string, content: unknown):
  { ok: true; data: unknown } | { ok: false; errors: z.ZodIssue[] } {
  const schema = schemaForType(type);
  if (!schema) {
    return { ok: true, data: content };  // type inconnu → pas de validation (legacy)
  }
  const r = schema.safeParse(content);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, errors: r.error.issues };
}
