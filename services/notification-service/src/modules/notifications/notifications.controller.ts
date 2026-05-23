import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get(':userId')
  getNotifications(@Param('userId') userId: string) {
    return { notifications: this.notificationsService.listForUser(userId) };
  }

  @Put(':userId/viewed/:notificationId')
  markViewed(@Param('userId') userId: string, @Param('notificationId') notificationId: string) {
    const success = this.notificationsService.markViewed(userId, notificationId);
    return { ok: success };
  }

  @Post(':userId')
  addNotification(@Param('userId') userId: string, @Body() body: { title: string; description: string; viewed?: boolean }) {
    const notification = this.notificationsService.addNotification({
      userId,
      title: body.title || 'New notification',
      description: body.description || '',
      viewed: !!body.viewed,
    });
    return { notification };
  }
}
