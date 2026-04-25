export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  createdBy: string;
  activeOntologyId: string;
}
