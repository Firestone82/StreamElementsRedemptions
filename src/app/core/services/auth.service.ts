import { Injectable, computed, signal } from '@angular/core';

const TOKEN_KEY = 'se_jwt_token';
const CHANNEL_OVERRIDE_KEY = 'se_channel_override';

/** Holds the StreamElements JWT and channel override, persisted to localStorage. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenSignal = signal(localStorage.getItem(TOKEN_KEY) ?? '');
  private readonly channelOverrideSignal = signal(localStorage.getItem(CHANNEL_OVERRIDE_KEY) ?? '');
  private readonly sessionErrorSignal = signal('');

  readonly loggedIn = computed(() => !!this.tokenSignal());

  get token(): string {
    return this.tokenSignal();
  }

  get channelOverride(): string {
    return this.channelOverrideSignal();
  }

  setToken(value: string): void {
    const trimmed = value.trim();
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
  }

  /** Logs the user out and leaves a message for the login screen to show once. */
  flagAuthError(message: string): void {
    this.sessionErrorSignal.set(message);
    this.clear();
  }

  consumeSessionError(): string {
    const message = this.sessionErrorSignal();
    this.sessionErrorSignal.set('');
    return message;
  }
}
