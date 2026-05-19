export function buildComparisonPrompt(docText: string, refText: string): string {
  return `Tu es un avocat senior qui produit un redline clause par clause transformant le DOCUMENT vers la RÉFÉRENCE.
Les deux textes sont organisés par clauses (## TYPE: Heading), extraites à l'indexation.

RÉFÉRENCE (texte cible, clauses extraites de la base) :
<reference>
${refText.substring(0, 8000)}
</reference>

DOCUMENT (à modifier, clauses extraites de la base) :
<document>
${docText.substring(0, 8000)}
</document>

INSTRUCTIONS :
1. Compare chaque clause du DOCUMENT avec la clause de même type dans la RÉFÉRENCE.
2. Pour chaque divergence substantielle, produis une proposition de modification.
3. Si une clause existe dans la RÉFÉRENCE mais pas dans le DOCUMENT, action=insert.
4. Si une clause existe dans le DOCUMENT mais pas dans la RÉFÉRENCE, action=delete.
5. Pour toute reformulation, action=replace.

RÈGLE CRITIQUE — originalText :
- Copie le texte EXACTEMENT tel qu'il apparaît dans le DOCUMENT (caractères identiques, pas de reformulation).
- N'invente pas du texte absent du DOCUMENT. Si tu ne peux pas citer verbatim, mets originalText="".

FORMAT DE SORTIE — réponds UNIQUEMENT avec un tableau JSON valide, pas de wrapper, pas de markdown :
[
  {
    "id": "rdl_001",
    "clauseTypeOntologyId": "DUREE",
    "action": "replace",
    "originalText": "copie verbatim exacte depuis le DOCUMENT",
    "proposedText": "texte proposé aligné sur la RÉFÉRENCE",
    "rationale": "Justification courte en français (1-2 phrases).",
    "severity": "major"
  }
]

Valeurs autorisées :
- action : "insert" | "delete" | "replace" | "comment"
- severity : "critical" | "major" | "minor" | "info"
- clauseTypeOntologyId : type de clause (DUREE, PRIX, RESILIATION, CONFIDENTIALITE…)
- originalText : "" uniquement pour action=insert
- proposedText : "" uniquement pour action=delete

Vise 5-20 propositions couvrant toutes les divergences réelles. Pas de changements cosmétiques.`;
}
