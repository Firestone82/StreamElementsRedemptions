import { Injectable, WritableSignal, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | null;

const STORAGE_KEY: string = 'se_theme';

/** Theme follows the system preference unless the user overrides it. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode: WritableSignal<ThemeMode> = signal<ThemeMode>(this.readStored());

  constructor() {
    this.apply();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.mode() === null) this.apply();
    });
  }

  cycle(): void {
    const current: ThemeMode = this.mode();
    const next: ThemeMode = current === null ? 'light' : current === 'light' ? 'dark' : null;
    next === null ? localStorage.removeItem(STORAGE_KEY) : localStorage.setItem(STORAGE_KEY, next);
    this.mode.set(next);
    this.apply();
  }

  label(): string {
    const mode: ThemeMode = this.mode();
    return mode === 'light' ? '☀ Light' : mode === 'dark' ? '🌙 Dark' : '🖥️ System';
  }

  private readStored(): ThemeMode {
    const stored: string | null = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  }

  private systemPrefersDark(): boolean {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  private apply(): void {
    const mode: ThemeMode = this.mode();
    const dark: boolean = mode === 'dark' || (mode !== 'light' && this.systemPrefersDark());
    document.documentElement.classList.toggle('dark', dark);
  }
}
