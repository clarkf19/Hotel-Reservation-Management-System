/**
 * UML «interface» OTAPlatform (external actor "OTA / Third-Party Booking Platforms")
 *   + pushAvailability(): Boolean
 *   + pullBookings(): Boolean
 *   + updateBookingStatus(): Boolean
 *   + getBookingDetails(): Boolean
 * Relationship: ChannelSync ..uses..> OTAPlatform
 * SRS: SI-2.1 (transmit inventory, rate, booking-status updates), SI-2.2 (poll for OTA-originated
 *      bookings), CO-2 (REST over HTTPS), CO-4 (at least two OTAs), DE-1
 *
 * IMPLEMENTATION DECISION: there are no real OTA credentials, so MockOTAPlatform
 * simulates each partner platform. Its bookings live in the mock_ota_bookings
 * table, which represents the OTA's own database; the HRMS only reaches it
 * through the four interface methods below, exactly as it would reach a real
 * REST API. A real adapter would implement the same methods with fetch().
 */
import { prisma } from '../../lib/prisma.js';

const pushedSnapshots = new Map(); // what each OTA currently advertises (its "listing")

export class MockOTAPlatform {
  constructor(channel) {
    this.channel = channel;
  }

  #assertReachable() {
    if (this.channel.status === 'ERROR') {
      const err = new Error(`${this.channel.channelName} API is not responding (HTTP 503)`);
      err.code = 'OTA_UNREACHABLE';
      throw err;
    }
  }

  /** pushAvailability(): publish room inventory and rates to the OTA listing. */
  async pushAvailability(snapshot) {
    this.#assertReachable();
    pushedSnapshots.set(this.channel.id, { ...snapshot, receivedAt: new Date().toISOString() });
    return true;
  }

  /** pullBookings(): bookings created, modified or cancelled on the OTA since the last pull. */
  async pullBookings() {
    this.#assertReachable();
    const rows = await prisma.mockOtaBooking.findMany({ where: { channelId: this.channel.id, pendingSync: true }, orderBy: { createdAt: 'asc' } });
    return rows.filter((b) => b.pendingSync);
  }

  /** getBookingDetails(): one booking as the OTA sees it. */
  async getBookingDetails(externalRef) {
    this.#assertReachable();
    return prisma.mockOtaBooking.findUnique({ where: { channelId_externalRef: { channelId: this.channel.id, externalRef } } });
  }

  /** updateBookingStatus(): tell the OTA what the hotel decided about one of its bookings. */
  async updateBookingStatus(externalRef, hrmsStatus, extra = {}) {
    this.#assertReachable();
    await prisma.mockOtaBooking.update({
      where: { channelId_externalRef: { channelId: this.channel.id, externalRef } },
      data: { hrmsStatus, pendingSync: false, pulledAt: new Date(), ...(extra.roomNumber ? { roomNumber: extra.roomNumber } : {}) },
    });
    return true;
  }

  /** Current listing as published on the OTA (for the channel-manager screen). */
  getPublishedListing() {
    return pushedSnapshots.get(this.channel.id) ?? null;
  }

  // ---- Simulation controls: actions that happen *on the OTA's side* ---------------------

  static async simulateGuestBooking(channel, booking) {
    const externalRef = `${channel.code}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    return prisma.mockOtaBooking.create({ data: { channelId: channel.id, externalRef, status: 'BOOKED', ...booking } });
  }

  static async simulateGuestCancellation(channel, externalRef) {
    return prisma.mockOtaBooking.update({ where: { channelId_externalRef: { channelId: channel.id, externalRef } }, data: { status: 'CANCELLED', pendingSync: true } });
  }
}

export function otaPlatformFor(channel) {
  return new MockOTAPlatform(channel);
}
