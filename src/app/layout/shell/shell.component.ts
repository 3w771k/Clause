import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { WorkspaceService } from '../../core/services/workspace.service';
import { AnalysisService } from '../../core/services/analysis.service';
import { ReferenceBaseService } from '../../core/services/reference-base.service';
import type { Workspace } from '../../core/models/workspace.model';
import type { Analysis } from '../../core/models/analysis.model';

interface BreadcrumbSegment { label: string; route: string | null; }

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.component.html',
})
export class ShellComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private wsService = inject(WorkspaceService);
  private anaService = inject(AnalysisService);
  private refService = inject(ReferenceBaseService);

  workspaces = signal<Workspace[]>([]);
  currentWorkspace = signal<Workspace | null>(null);
  analyses = signal<Analysis[]>([]);
  refCounts = signal({ playbook: 0, standard: 0, grille_dd: 0, clausier: 0 });
  sidebarOpen = signal(true);
  breadcrumbs = signal<BreadcrumbSegment[]>([]);

  private currentWsId = '';
  private subs = new Subscription();

  ngOnInit() {
    this.wsService.list().subscribe(ws => {
      this.workspaces.set(ws);
      this.buildBreadcrumb(this.router.url);
    });
    this.loadRefCounts();
    this.subs.add(
      this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
        this.updateFromRoute();
      })
    );
    this.updateFromRoute();
  }

  ngOnDestroy() { this.subs.unsubscribe(); }

  private updateFromRoute() {
    const url = this.router.url;
    const wsMatch = url.match(/\/workspaces\/([^/?]+)/);
    const wsId = wsMatch?.[1] ?? '';

    if (wsId && wsId !== this.currentWsId) {
      this.currentWsId = wsId;
      this.wsService.list().subscribe(ws => {
        this.workspaces.set(ws);
        this.currentWorkspace.set(ws.find(w => w.id === wsId) ?? null);
        this.buildBreadcrumb(url);
      });
      this.anaService.list(wsId).subscribe(a =>
        this.analyses.set([...a].sort((x, y) => y.lastActivityAt.localeCompare(x.lastActivityAt)))
      );
    } else {
      this.buildBreadcrumb(url);
    }
  }

  private buildBreadcrumb(url: string) {
    const segs: BreadcrumbSegment[] = [{ label: 'Espaces de travail', route: '/workspaces' }];
    const wsMatch = url.match(/\/workspaces\/([^/?]+)/);
    if (wsMatch) {
      const ws = this.workspaces().find(w => w.id === wsMatch[1]);
      segs.push({ label: ws?.name ?? wsMatch[1], route: `/workspaces/${wsMatch[1]}` });
      const anaMatch = url.match(/\/analyses\/([^/?]+)/);
      if (anaMatch) {
        segs.push({ label: 'Legal Extraction', route: null });
        const ana = this.analyses().find(a => a.id === anaMatch[1]);
        if (ana) segs.push({ label: ana.name, route: null });
      } else if (url.includes('/reference-base')) {
        segs.push({ label: 'Base de référence', route: null });
      }
    }
    this.breadcrumbs.set(segs);
  }

  private loadRefCounts() {
    this.refService.list().subscribe(assets => {
      this.refCounts.set({
        playbook:  assets.filter(a => a.type === 'playbook').length,
        standard:  assets.filter(a => a.type === 'standard').length,
        grille_dd: assets.filter(a => a.type === 'dd_grid').length,
        clausier:  assets.filter(a => a.type === 'clausier').length,
      });
    });
  }

  get currentWsIdFromUrl() {
    return this.router.url.match(/\/workspaces\/([^/?]+)/)?.[1] ?? '';
  }

  toggleSidebar() { this.sidebarOpen.update(v => !v); }
}
