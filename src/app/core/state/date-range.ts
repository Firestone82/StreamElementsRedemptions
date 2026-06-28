import { Signal, WritableSignal, signal } from '@angular/core';
import { isoBounds, todayIso } from '../utils/date.util';

/** Bundles the applied from/to dates that otherwise get re-declared as two separate signals. */
export class DateRange {
  private readonly fromSignal: WritableSignal<string>;
  private readonly toSignal: WritableSignal<string>;

  readonly from: Signal<string>;
  readonly to: Signal<string>;

  constructor(from: string = todayIso(), to: string = todayIso()) {
    this.fromSignal = signal<string>(from);
    this.toSignal = signal<string>(to);

    this.from = this.fromSignal.asReadonly();
    this.to = this.toSignal.asReadonly();
  }

  set(from: string, to: string): void {
    this.fromSignal.set(from);
    this.toSignal.set(to);
  }

  bounds(): [string | null, string | null] {
    return isoBounds(this.fromSignal(), this.toSignal());
  }
}
