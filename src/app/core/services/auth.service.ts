import { Injectable, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

const TOKEN_KEY: string = 'se_jwt_token';
const CHANNEL_OVERRIDE_KEY: string = 'se_channel_override';

/** Holds the StreamElements JWT and channel override, persisted to localStorage. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);

  private readonly tokenSignal: WritableSignal<string> = signal<string>(localStorage.getItem(TOKEN_KEY) ?? '');
  private readonly channelOverrideSignal: WritableSignal<string> = signal<string>(localStorage.getItem(CHANNEL_OVERRIDE_KEY) ?? '');
  private readonly sessionErrorSignal: WritableSignal<string> = signal<string>('');

  readonly loggedIn: Signal<boolean> = computed<boolean>(() => !!this.tokenSignal());

  get token(): string {
    return this.tokenSignal();
  }

  get channelOverride(): string {
    return this.channelOverrideSignal();
  }

  setToken(value: string): void {
    const trimmed: string = value.trim();
    trimmed ? localStorage.setItem(TOKEN_KEY, trimmed) : localStorage.removeItem(TOKEN_KEY);
    this.tokenSignal.set(trimmed);
  }

  setChannelOverride(value: string): void {
    value ? localStorage.setItem(CHANNEL_OVERRIDE_KEY, value) : localStorage.removeItem(CHANNEL_OVERRIDE_KEY);
    this.channelOverrideSignal.set(value);
  }

  clear(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CHANNEL_OVERRIDE_KEY);
    this.tokenSignal.set('');
    this.channelOverrideSignal.set('');
    void this.router.navigate(['/login']);
  }

  /** Logs the user out and leaves a message for the login screen to show once. */
  flagAuthError(message: string): void {
    this.sessionErrorSignal.set(message);
    this.clear();
  }

  consumeSessionError(): string {
    const message: string = this.sessionErrorSignal();
    this.sessionErrorSignal.set('');
    return message;
  }
}
