import { Signal, WritableSignal, computed, signal } from '@angular/core';

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * Unifies the status/error/body trio that otherwise gets re-declared as
 * three separate signals around every async operation.
 */
export class AsyncSignal<T> {
  private readonly statusSignal: WritableSignal<AsyncStatus>;
  private readonly errorSignal: WritableSignal<string>;
  private readonly bodySignal: WritableSignal<T>;

  readonly status: Signal<AsyncStatus>;
  readonly error: Signal<string>;
  readonly body: Signal<T>;
  readonly busy: Signal<boolean>;

  constructor(initialBody: T) {
    this.statusSignal = signal<AsyncStatus>('idle');
    this.errorSignal = signal<string>('');
    this.bodySignal = signal<T>(initialBody);

    this.status = this.statusSignal.asReadonly();
    this.error = this.errorSignal.asReadonly();
    this.body = this.bodySignal.asReadonly();
    this.busy = computed<boolean>(() => this.statusSignal() === 'loading');
  }

  start(): void {
    this.statusSignal.set('loading');
    this.errorSignal.set('');
  }

  succeed(body: T): void {
    this.bodySignal.set(body);
    this.errorSignal.set('');
    this.statusSignal.set('success');
  }

  fail(message: string): void {
    this.errorSignal.set(message);
    this.statusSignal.set('error');
  }

  /** Like fail(), but also replaces the body — for operations that should clear stale results on error. */
  failWith(body: T, message: string): void {
    this.bodySignal.set(body);
    this.errorSignal.set(message);
    this.statusSignal.set('error');
  }

  /** Clears the busy flag without touching the body — for transient operations that share a spinner but don't own its result. */
  stop(): void {
    this.statusSignal.set(this.errorSignal() ? 'error' : 'success');
  }

  reset(body: T): void {
    this.bodySignal.set(body);
    this.errorSignal.set('');
    this.statusSignal.set('idle');
  }
}
