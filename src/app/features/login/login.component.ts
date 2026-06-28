import { Component, WritableSignal, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { StreamElementsService } from '../../core/services/stream-elements.service';
import { AsyncSignal } from '../../core/state/async-signal';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {

  // ===================================
  // ===] Dependencies [================

  private readonly authService = inject(AuthService);
  private readonly streamElementsService = inject(StreamElementsService);
  private readonly router = inject(Router);

  // ===================================
  // ===] State [=======================

  readonly token: WritableSignal<string> = signal<string>('');
  readonly connectAsync: AsyncSignal<null> = new AsyncSignal<null>(null);

  // ===================================
  // ===] Lifecycle [===================

  constructor() {
    const sessionError: string = this.authService.consumeSessionError();
    if (sessionError) this.connectAsync.fail(sessionError);
  }

  // ===================================
  // ===] Actions [=====================

  async submit(): Promise<void> {
    const value: string = this.token().trim();
    if (!value) return;

    this.connectAsync.start();
    try {
      await this.streamElementsService.connect(value);
      this.connectAsync.succeed(null);
      void this.router.navigate(['/']);
    } catch (err) {
      this.connectAsync.fail(err instanceof Error ? err.message : 'Could not connect.');
    }
  }
}
