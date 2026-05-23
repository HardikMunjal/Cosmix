import { Injectable } from '@nestjs/common';

type NotificationItem = {
  id: string;
  userId: string;
  title: string;
  description: string;
  viewed: boolean;
  createdAt: string;
};

@Injectable()
export class NotificationsService {
  private notifications: NotificationItem[] = [];

  constructor() {
    const sampleNotifications = [
      {
        userId: 'user-1',
        title: 'Your weekly wellness recap is ready',
        description: 'Open the wellness dashboard to review your best run and next recovery day.',
        viewed: false,
      },
      {
        userId: 'user-1',
        title: 'New challenge unlocked',
        description: 'A running streak challenge is available for your training circle.',
        viewed: false,
      },
      {
        userId: 'user-2',
        title: 'Buddy request received',
        description: 'A new training partner wants to compare goals with you.',
        viewed: false,
      },
    ];

    for (const item of sampleNotifications) {
      this.addNotification(item);
    }
  }

  listForUser(userId: string): NotificationItem[] {
    return this.notifications
      .filter((item) => item.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  markViewed(userId: string, notificationId: string): boolean {
    const notification = this.notifications.find((item) => item.userId === userId && item.id === notificationId);
    if (!notification) return false;
    notification.viewed = true;
    return true;
  }

  addNotification(item: Omit<NotificationItem, 'createdAt' | 'id'>): NotificationItem {
    const notification: NotificationItem = {
      id: `notif-${Date.now()}-${Math.round(Math.random() * 9999)}`,
      createdAt: new Date().toISOString(),
      ...item,
    };
    this.notifications.push(notification);
    return notification;
  }

  countUnread(userId: string): number {
    return this.notifications.filter((item) => item.userId === userId && !item.viewed).length;
  }
}
