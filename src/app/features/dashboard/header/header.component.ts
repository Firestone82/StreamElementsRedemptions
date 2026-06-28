import { Component, InputSignal, OutputEmitterRef, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../../core/services/theme.service';
import { Channel } from '../../../core/models/models';

@Component({
  selector: 'app-header',
  imports: [FormsModule],
  templateUrl: './header.component.html',
})
export class HeaderComponent {

  // ===================================
  // ===] Dependencies [================

  protected readonly themeService = inject(ThemeService);

  // ===================================
  // ===] Inputs / Outputs [============

  readonly channelName: InputSignal<string> = input<string>('...');
  readonly availableChannels: InputSignal<Channel[]> = input<Channel[]>([]);
  readonly selectedChannelId: InputSignal<string> = input<string>('');

  readonly channelChange: OutputEmitterRef<string> = output<string>();
  readonly disconnect: OutputEmitterRef<void> = output<void>();
}
