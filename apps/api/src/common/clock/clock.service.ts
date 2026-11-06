import { Global, Injectable, Module } from '@nestjs/common';

/**
 * Single source of "now" for business logic. Tests freeze or move time with
 * `set()` / `advance()` so deadline and expiry rules can be verified precisely.
 */
@Injectable()
export class ClockService {
  private fixed: Date | null = null;

  now(): Date {
    return this.fixed ? new Date(this.fixed.getTime()) : new Date();
  }

  /** Test helper: freeze time at the given instant (pass null to unfreeze). */
  set(date: Date | string | null): void {
    this.fixed = date === null ? null : new Date(date);
  }

  /** Test helper: move frozen time forward. */
  advance(ms: number): void {
    this.fixed = new Date((this.fixed ?? new Date()).getTime() + ms);
  }
}

@Global()
@Module({
  providers: [ClockService],
  exports: [ClockService],
})
export class ClockModule {}
