import { Component, HostListener, InputSignal, OutputEmitterRef, WritableSignal, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { todayIso } from '../../../core/utils/date.util';
import { ExportFormat } from '../../../core/models/models';
import { FilterablePair } from '../../../core/state/filterable-pair';

@Component({
  selector: 'app-redemptions-controls',
  imports: [FormsModule],
  templateUrl: './redemptions-controls.component.html',
})
export class RedemptionsControlsComponent {

  // ===================================
  // ===] Inputs / Outputs [============

  readonly grouped: InputSignal<boolean> = input<boolean>(false);
  readonly busy: InputSignal<boolean> = input<boolean>(false);
  readonly filter: InputSignal<FilterablePair | null> = input<FilterablePair | null>(null);

  readonly applyRange: OutputEmitterRef<{ from: string; to: string }> = output<{ from: string; to: string }>();
  readonly refresh: OutputEmitterRef<void> = output<void>();
  readonly toggleGroup: OutputEmitterRef<void> = output<void>();
  readonly export: OutputEmitterRef<ExportFormat> = output<ExportFormat>();

  // ===================================
  // ===] State [=======================

  readonly fromDate: WritableSignal<string> = signal<string>(todayIso());
  readonly toDate: WritableSignal<string> = signal<string>(todayIso());
  readonly exportMenuOpen: WritableSignal<boolean> = signal<boolean>(false);

  // ===================================
  // ===] Actions [=====================

  apply(): void {
    this.applyRange.emit({ from: this.fromDate(), to: this.toDate() });
  }

  toggleExportMenu(event: Event): void {
    event.stopPropagation();
    this.exportMenuOpen.set(!this.exportMenuOpen());
  }

  doExport(format: ExportFormat): void {
    this.exportMenuOpen.set(false);
    this.export.emit(format);
  }

  @HostListener('document:click')
  closeExportMenu(): void {
    this.exportMenuOpen.set(false);
  }
}
