import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { WorkspaceService } from '../../core/services/workspace.service';
import { AnalysisService } from '../../core/services/analysis.service';
import { ReferenceBaseService } from '../../core/services/reference-base.service';
import type { Workspace } from '../../core/models/workspace.model';
import type { Analysis } from '../../core/models/analysis.model';

const SIDEBAR_KEY = 'sidebarOpen';

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
  sidebarOpen = signal(this.readSidebarPref());

  private currentWsId = '';
  private subs = new Subscription();

  ngOnInit() {
    this.wsService.list().subscribe(ws => this.workspaces.set(ws));
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
      });
      this.anaService.list(wsId).subscribe(a =>
        this.analyses.set([...a].sort((x, y) => y.lastActivityAt.localeCompare(x.lastActivityAt)))
      );
    } else if (!wsId) {
      this.currentWsId = '';
      this.currentWorkspace.set(null);
      this.analyses.set([]);
    }
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

  private readSidebarPref(): boolean {
    try {
      const v = localStorage.getItem(SIDEBAR_KEY);
      if (v === 'false') return false;
      return true;
    } catch { return true; }
  }

  toggleSidebar() {
    this.sidebarOpen.update(v => {
      const next = !v;
      try { localStorage.setItem(SIDEBAR_KEY, String(next)); } catch {}
      return next;
    });
  }
}
