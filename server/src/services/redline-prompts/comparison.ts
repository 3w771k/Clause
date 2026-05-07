export function buildComparisonPrompt(docText: string, refText: string): string {
  return `Tu es senior legal counsel. Tu produis un redline qui transforme DOCUMENT vers REFERENCE.

REFERENCE :
<reference>
${refText.substring(0, 6000)}
</reference>

DOCUMENT à modifier :
<document>
${docText.substring(0, 6000)}
</document>

Identifie les divergences puis propose les modifications pour aligner DOCUMENT sur REFERENCE.
Retourne UNIQUEMENT un tableau JSON de proposals avec :
- id, action, originalText, proposedText, rationale, severity (cf. format standard)
- pas de deviatesFromAssetId ici (comparaison doc-vs-doc)`;
}
