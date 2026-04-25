import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type { Workspace } from '../../../core/models/workspace.model';

@Component({
  selector: 'app-workspace-list',
  imports: [FormsModule],
  templateUrl: './workspace-list.component.html',
})
export class WorkspaceListComponent implements OnInit {
  private wsService = inject(WorkspaceService);
  private router = inject(Router);

  workspaces = signal<Workspace[]>([]);
  creating = signal(false);
  newName = signal('');
  newDesc = signal('');

  ngOnInit() {
    this.load();
  }

  load() {
    this.wsService.list().subscribe(ws => this.workspaces.set(ws));
  }

  open(ws: Workspace) {
    this.router.navigate(['/workspaces', ws.id]);
  }

  create() {
    const name = this.newName().trim();
    if (!name) return;
    this.wsService.create(name, this.newDesc().trim() || undefined).subscribe(ws => {
      this.workspaces.update(list => [...list, ws]);
      this.newName.set('');
      this.newDesc.set('');
      this.creating.set(false);
      this.router.navigate(['/workspaces', ws.id]);
    });
  }

  formatDate(d: string) {
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
