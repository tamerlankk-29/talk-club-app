import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Publishes domain events and waits for listeners, but never lets a failing
 * listener break the operation that already committed — failures are logged.
 */
@Injectable()
export class EventBus {
  private readonly logger = new Logger(EventBus.name);

  constructor(private readonly emitter: EventEmitter2) {}

  async publish<T extends object>(name: string, payload: T): Promise<void> {
    try {
      await this.emitter.emitAsync(name, payload);
    } catch (error) {
      this.logger.error(`Listener failed for ${name}: ${(error as Error).message}`, (error as Error).stack);
    }
  }
}

@Global()
@Module({
  providers: [EventBus],
  exports: [EventBus],
})
export class EventBusModule {}
