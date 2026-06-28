import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StoreItem } from '../../../core/models/models';

@Component({
  selector: 'app-items-list',
  imports: [FormsModule],
  templateUrl: './items-list.component.html',
})
export class ItemsListComponent {
  readonly items = input<StoreItem[]>([]);
  readonly selectedId = input<string | null>(null);

  readonly select = output<string>();

  readonly search = signal('');
  readonly activeOnly = signal(false);

  readonly filteredItems = computed(() => {
    const query = this.search().trim().toLowerCase();
    const activeOnly = this.activeOnly();
    return this.items().filter((item) => (!activeOnly || item.enabled) && (!query || item.name.toLowerCase().includes(query)));
  });
}
