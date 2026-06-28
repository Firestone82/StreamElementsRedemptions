import { Component, HostListener, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { todayIso } from '../../../core/utils/date.util';
import { ExportFormat } from '../../../core/models/models';

@Component({
  selector: 'app-redemptions-controls',
  imports: [FormsModule],
  templateUrl: './redemptions-controls.component.html',
})
export class RedemptionsControlsComponent {
  readonly grouped = input(false);
  readonly busy = input(false);

  readonly groupSearch = model('');

  readonly applyRange = output<{ from: string; to: string }>();
  readonly refresh = output<void>();
  readonly toggleGroup = output<void>();
  readonly export = output<ExportFormat>();

  readonly fromDate = signal(todayIso());
  readonly toDate = signal(todayIso());
  readonly exportMenuOpen = signal(false);

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
