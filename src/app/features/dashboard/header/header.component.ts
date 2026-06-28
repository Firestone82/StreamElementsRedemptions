import { Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../../core/services/theme.service';
import { Channel } from '../../../core/models/models';

@Component({
  selector: 'app-header',
  imports: [FormsModule],
  templateUrl: './header.component.html',
})
export class HeaderComponent {
  protected readonly theme = inject(ThemeService);

  readonly channelName = input('…');
  readonly availableChannels = input<Channel[]>([]);
  readonly selectedChannelId = input('');

  readonly channelChange = output<string>();
  readonly disconnect = output<void>();
}
