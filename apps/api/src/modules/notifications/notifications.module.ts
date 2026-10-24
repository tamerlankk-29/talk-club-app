import { Global, Module } from '@nestjs/common';
import { NotificationListeners } from './notification-listeners';
import { NotificationVarsService } from './notification-vars.service';
import { AdminNotificationsController, NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { RemindersService } from './reminders.service';

@Global()
@Module({
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [NotificationsService, NotificationVarsService, NotificationListeners, RemindersService],
  exports: [NotificationsService, NotificationVarsService, RemindersService],
})
export class NotificationsModule {}
