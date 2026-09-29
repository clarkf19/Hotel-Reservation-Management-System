/**
 * UML «interface» NotificationService (external actor "Notification Service (Email / SMS / Push)")
 *   + sendEmail(to, subject, body): Boolean
 *   + sendSMS(to, message): Boolean
 *   + sendPush(to, title, body): Boolean
 * Relationship: Reservation ..uses..> NotificationService
 * SRS: SI-4.1, CI-1 (booking confirmation), CI-2 (problem alerts), CI-3 (check-in reminder), HI-2 (push)
 *
 * IMPLEMENTATION DECISION: local development uses a simulated provider. Every
 * message is written to the `notifications` table (the outbox) and logged to the
 * console; nothing leaves the machine. A real provider (SMTP, SMS gateway, FCM)
 * can replace SimulatedNotificationProvider without touching callers.
 */
import { prisma } from '../lib/prisma.js';

class SimulatedNotificationProvider {
  async deliver({ userId, channel, type, recipient, subject, body }) {
    if (!process.env.VITEST) console.log(`[notify:${channel.toLowerCase()}] -> ${recipient} | ${subject}`);
    await prisma.notification.create({
      data: { userId, channel, type, recipient, subject, body, status: 'SENT' },
    });
    return true;
  }
}

export class NotificationService {
  constructor(provider = new SimulatedNotificationProvider()) {
    this.provider = provider;
  }

  /** @param {{userId:number,email:string}} to */
  async sendEmail(to, subject, body, type = 'GENERAL') {
    return this.provider.deliver({ userId: to.userId, channel: 'EMAIL', type, recipient: to.email, subject, body });
  }

  /** @param {{userId:number,phone:string}} to */
  async sendSMS(to, message, type = 'GENERAL') {
    if (!to.phone) return false;
    return this.provider.deliver({ userId: to.userId, channel: 'SMS', type, recipient: to.phone, subject: 'SMS', body: message });
  }

  /** @param {{userId:number,email:string}} to */
  async sendPush(to, title, body, type = 'GENERAL') {
    return this.provider.deliver({ userId: to.userId, channel: 'PUSH', type, recipient: `device:${to.userId}`, subject: title, body });
  }

  /** In-app notification shown in the bell menu. */
  async sendInApp(to, title, body, type = 'GENERAL') {
    return this.provider.deliver({ userId: to.userId, channel: 'IN_APP', type, recipient: `user:${to.userId}`, subject: title, body });
  }

  /**
   * Convenience: notify a user on several channels. Failures are swallowed so a
   * notification problem never rolls back a booking (they are logged instead).
   */
  async notifyUser(userId, { type, subject, body, channels = ['IN_APP', 'EMAIL'] }) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, phone: true } });
    if (!user) return false;
    const to = { userId: user.id, email: user.email, phone: user.phone };
    const results = await Promise.allSettled(
      channels.map((c) =>
        c === 'EMAIL' ? this.sendEmail(to, subject, body, type)
          : c === 'SMS' ? this.sendSMS(to, `${subject}: ${body}`, type)
            : c === 'PUSH' ? this.sendPush(to, subject, body, type)
              : this.sendInApp(to, subject, body, type),
      ),
    );
    return results.every((r) => r.status === 'fulfilled');
  }

  /** Notify every active user holding one of the given roles (e.g. escalations to Receptionists). */
  async notifyRole(roleNames, message) {
    const users = await prisma.user.findMany({
      where: { isActive: true, role: { roleName: { in: roleNames } } },
      select: { id: true },
    });
    await Promise.allSettled(users.map((u) => this.notifyUser(u.id, { channels: ['IN_APP'], ...message })));
  }
}

export const notificationService = new NotificationService();
