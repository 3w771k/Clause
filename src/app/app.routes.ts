import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'workspaces', pathMatch: 'full' },
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell.component').then(m => m.ShellComponent),
    children: [
      {
        path: 'workspaces',
        loadComponent: () => import('./features/workspaces/workspace-list/workspace-list.component').then(m => m.WorkspaceListComponent),
      },
      {
        path: 'workspaces/:wsId',
        children: [
          {
            path: '',
            loadComponent: () => import('./features/workspaces/workspace-detail/workspace-detail.component').then(m => m.WorkspaceDetailComponent),
          },
          {
            path: 'documents/:docId',
            loadComponent: () => import('./features/workspaces/document-detail/document-detail.component').then(m => m.DocumentDetailComponent),
          },
          {
            path: 'analyses/new',
            loadComponent: () => import('./features/analysis/analysis-wizard/analysis-wizard.component').then(m => m.AnalysisWizardComponent),
          },
          {
            path: 'analyses/:anaId',
            loadComponent: () => import('./features/analysis/analysis-page/analysis-page.component').then(m => m.AnalysisPageComponent),
          },
        ],
      },
      {
        path: 'reference-base',
        loadComponent: () => import('./features/reference-base/reference-base.component').then(m => m.ReferenceBaseComponent),
      },
    ],
  },
];
