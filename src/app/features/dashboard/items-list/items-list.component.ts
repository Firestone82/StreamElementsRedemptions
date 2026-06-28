import { Component, InputSignal, OutputEmitterRef, Signal, WritableSignal, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StoreItem } from '../../../core/models/models';

@Component({
  selector: 'app-items-list',
  imports: [FormsModule],
  templateUrl: './items-list.component.html',
})
export class ItemsListComponent {

  // ===================================
  // ===] Inputs / Outputs [============

  readonly items: InputSignal<StoreItem[]> = input<StoreItem[]>([]);
  readonly selectedId: InputSignal<string | null> = input<string | null>(null);

  readonly select: OutputEmitterRef<string> = output<string>();

  // ===================================
  // ===] State [=======================

  readonly search: WritableSignal<string> = signal<string>('');
  readonly activeOnly: WritableSignal<boolean> = signal<boolean>(false);

  // ===================================
  // ===] Computed [====================

  readonly filteredItems: Signal<StoreItem[]> = computed<StoreItem[]>(() => {
    const query: string = this.search().trim().toLowerCase();
    const activeOnly: boolean = this.activeOnly();
    return this.items().filter((item) => (!activeOnly || item.enabled) && (!query || item.name.toLowerCase().includes(query)));
  });
}
