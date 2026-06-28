import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { StreamElementsService } from '../../core/services/stream-elements.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly streamElements = inject(StreamElementsService);

  readonly token = signal('');
  readonly connecting = signal(false);
  readonly errorMessage = signal(this.auth.consumeSessionError());

  readonly connected = output<void>();

  async submit(): Promise<void> {
    const value = this.token().trim();
    if (!value) return;

    this.connecting.set(true);
    this.errorMessage.set('');
    try {
      await this.streamElements.connect(value);
      this.connected.emit();
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Could not connect.');
    } finally {
      this.connecting.set(false);
    }
  }
}
