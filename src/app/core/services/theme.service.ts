import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | null;

const STORAGE_KEY = 'se_theme';

/** Theme follows the system preference unless the user overrides it. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.readStored());

  constructor() {
    this.apply();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.mode() === null) this.apply();
    });
  }

  cycle(): void {
    const current = this.mode();
    const next: ThemeMode = current === null ? 'light' : current === 'light' ? 'dark' : null;
    next === null ? localStorage.removeItem(STORAGE_KEY) : localStorage.setItem(STORAGE_KEY, next);
    this.mode.set(next);
    this.apply();
  }

  label(): string {
    const mode = this.mode();
    return mode === 'light' ? '☀ Light' : mode === 'dark' ? '🌙 Dark' : '🖥️ System';
  }

  private readStored(): ThemeMode {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  }

  private systemPrefersDark(): boolean {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  private apply(): void {
    const mode = this.mode();
    const dark = mode === 'dark' || (mode !== 'light' && this.systemPrefersDark());
    document.documentElement.classList.toggle('dark', dark);
  }
}
