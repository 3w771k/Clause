import type {
  AssetType, PlaybookContent, StandardContent, DDGridContent,
  ClausierAssetContent, TabularWorkflowContent,
} from './asset-content.model';

export interface ReferenceAsset {
  id: string;
  type: AssetType | string;  // string fallback pour les vieux assets non migrés
  name: string;
  description: string;
  createdAt: string;
  lastUpdatedAt: string;
  ontologyId: string;
  jurisdiction: string | null;
  language: string;
  currentVersion: number;
  governanceStatus: string;
  tags: string[];
  // Union des contents typés. Au runtime, vérifier le type via les guards
  // d'asset-content.model avant de cast vers le type concret.
  content: PlaybookContent | StandardContent | DDGridContent
         | ClausierAssetContent | TabularWorkflowContent
         | Record<string, unknown>;
}
