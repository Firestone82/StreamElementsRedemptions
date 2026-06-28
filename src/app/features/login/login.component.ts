import { Component, WritableSignal, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { StreamElementsService } from '../../core/services/stream-elements.service';
import { AsyncSignal } from '../../core/state/async-signal';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  // =============================
  // === Dependencies ============
  // =============================
  private readonly authService = inject(AuthService);
  private readonly streamElementsService = inject(StreamElementsService);

  // =============================
  // === State ====================
  // =============================
  readonly token: WritableSignal<string> = signal<string>('');
  readonly connectAsync: AsyncSignal<null> = new AsyncSignal<null>(null);

  readonly connected = output<void>();

  // =============================
  // === Lifecycle ================
  // =============================
  constructor() {
    const sessionError: string = this.authService.consumeSessionError();
    if (sessionError) this.connectAsync.fail(sessionError);
  }

  // =============================
  // === Actions ===================
  // =============================
  async submit(): Promise<void> {
    const value: string = this.token().trim();
    if (!value) return;

    this.connectAsync.start();
    try {
      await this.streamElementsService.connect(value);
      this.connectAsync.succeed(null);
      this.connected.emit();
    } catch (err) {
      this.connectAsync.fail(err instanceof Error ? err.message : 'Could not connect.');
    }
  }
}
