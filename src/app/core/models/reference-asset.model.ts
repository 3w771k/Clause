export interface ReferenceAsset {
  id: string;
  type: string;
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
  content: Record<string, unknown>;
}
