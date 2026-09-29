/**
 * Demo data for the Hotel Reservation Management System.
 *   npm run db:seed        (also run automatically by `npm run db:reset`)
 *
 * Generates a realistic, internally consistent hotel: 30 rooms in 6 room types,
 * ~45 guests, ~60 days of history and ~30 days of forward bookings, payments that
 * match the mock gateway ledger (plus two deliberate discrepancies for the
 * reconciliation demo), invoices, loyalty accounts, digital keys, OTA bookings
 * (including conflicts), service requests, concierge chats, notifications and audit logs.
 * Randomness is seeded, so every run produces the same hotel relative to "today".
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_GRANTS, PERMISSIONS, ROLES } from '../src/domain/rbac.js';
import { addDays, atHotelTime, hotelToday, nightsBetween } from '../src/lib/dates.js';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const here = path.dirname(fileURLToPath(import.meta.url));
const LEDGER = process.env.MOCK_GATEWAY_LEDGER || path.join(here, '../.data/mock-gateway-ledger.json');
export const DEMO_PASSWORD = 'Hotel@2026';

// ---- deterministic randomness ------------------------------------------------
let seed = 20240300055;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const r2 = (n) => Math.round(n * 100) / 100;
const TAX = DEFAULT_SETTINGS.taxRatePercent.value;
const txnId = () => `txn_${crypto.randomBytes(9).toString('hex')}`;

const ROOM_TYPES = [
  { typeName: 'Classic Queen', category: 'STANDARD', baseRate: 4500, maxOccupancy: 2, sizeSqm: 26, bedType: 'Queen', description: 'A calm, light-filled room with a plush queen bed, rain shower and work desk — ideal for short city stays.', amenities: ['Free Wi-Fi', 'Rain shower', 'Smart TV', 'Tea & coffee', 'Work desk'], imageUrl: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=1200&q=80' },
  { typeName: 'Deluxe King', category: 'DELUXE', baseRate: 7200, maxOccupancy: 3, sizeSqm: 34, bedType: 'King', description: 'Generous room with a king bed, lounge chair and floor-to-ceiling windows, many overlooking the bay.', amenities: ['Free Wi-Fi', 'Bathtub', 'Smart TV', 'Minibar', 'Nespresso', 'Bathrobes'], imageUrl: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1200&q=80' },
  { typeName: 'Deluxe Twin', category: 'DELUXE', baseRate: 6800, maxOccupancy: 3, sizeSqm: 34, bedType: 'Twin', description: 'Two comfortable single beds and a sofa corner — perfect for friends or colleagues travelling together.', amenities: ['Free Wi-Fi', 'Smart TV', 'Minibar', 'Nespresso', 'Sofa'], imageUrl: 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=1200&q=80' },
  { typeName: 'Accessible Deluxe', category: 'ACCESSIBLE', baseRate: 6500, maxOccupancy: 2, sizeSqm: 38, bedType: 'King', description: 'Step-free access, roll-in shower, lowered fixtures and visual alarms, without compromising on comfort.', amenities: ['Roll-in shower', 'Grab rails', 'Visual alarms', 'Wide doorways', 'Free Wi-Fi'], imageUrl: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200&q=80' },
  { typeName: 'Junior Suite', category: 'SUITE', baseRate: 12500, maxOccupancy: 3, sizeSqm: 52, bedType: 'King', description: 'Separate living area, deep soaking tub and panoramic views, with evening turndown and lounge access.', amenities: ['Living area', 'Soaking tub', 'Lounge access', 'Evening turndown', 'Bose speaker', 'Minibar'], imageUrl: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=1200&q=80' },
  { typeName: 'Presidential Suite', category: 'SUITE', baseRate: 28000, maxOccupancy: 4, sizeSqm: 120, bedType: 'King', description: 'Our finest residence: two bedrooms, a dining room for six, private terrace and a dedicated butler.', amenities: ['Private terrace', 'Butler service', 'Dining room', 'Two bedrooms', 'Steam shower', 'Airport transfer'], imageUrl: 'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=1200&q=80' },
];

// roomNumber, typeName, floor, capacity, view, accessible, features
const ROOMS = [
  ['101', 'Classic Queen', 1, 2, 'Garden', false, ['Near elevator']], ['102', 'Classic Queen', 1, 2, 'Garden', false, []], ['103', 'Classic Queen', 1, 2, 'City', false, ['Quiet zone']],
  ['104', 'Classic Queen', 1, 2, 'City', false, []], ['105', 'Accessible Deluxe', 1, 2, 'Garden', true, ['Near elevator', 'Step-free']], ['106', 'Deluxe Twin', 1, 3, 'Pool', false, []],
  ['201', 'Classic Queen', 2, 2, 'City', false, ['Near elevator']], ['202', 'Classic Queen', 2, 2, 'City', false, []], ['203', 'Deluxe King', 2, 3, 'Sea', false, []],
  ['204', 'Deluxe King', 2, 3, 'Sea', false, ['Quiet zone']], ['205', 'Deluxe Twin', 2, 3, 'Pool', false, []], ['206', 'Accessible Deluxe', 2, 2, 'Pool', true, ['Near elevator', 'Step-free']],
  ['301', 'Deluxe King', 3, 3, 'Sea', false, []], ['302', 'Deluxe King', 3, 3, 'Sea', false, ['Quiet zone']], ['303', 'Deluxe Twin', 3, 3, 'City', false, []],
  ['304', 'Deluxe Twin', 3, 3, 'City', false, ['Near elevator']], ['305', 'Deluxe King', 3, 3, 'Sea', false, ['Corner room']], ['306', 'Classic Queen', 3, 2, 'Garden', false, ['Quiet zone']],
  ['401', 'Deluxe King', 4, 3, 'Sea', false, ['High floor']], ['402', 'Deluxe King', 4, 3, 'City', false, ['High floor', 'Quiet zone']], ['403', 'Junior Suite', 4, 3, 'Sea', false, ['High floor', 'Corner room']],
  ['404', 'Junior Suite', 4, 3, 'Sea', false, ['High floor']], ['405', 'Deluxe Twin', 4, 3, 'City', false, ['High floor']],
  ['501', 'Junior Suite', 5, 3, 'Sea', false, ['High floor', 'Quiet zone']], ['502', 'Junior Suite', 5, 3, 'Sea', false, ['High floor']], ['503', 'Deluxe King', 5, 3, 'Sea', false, ['High floor']],
  ['504', 'Deluxe King', 5, 3, 'City', false, ['High floor', 'Near elevator']],
  ['601', 'Presidential Suite', 6, 4, 'Sea', false, ['Penthouse', 'Private terrace']], ['602', 'Junior Suite', 6, 3, 'Sea', false, ['High floor', 'Quiet zone']], ['603', 'Deluxe King', 6, 3, 'Sea', false, ['High floor', 'Quiet zone']],
];

const FIRST = ['Aarav', 'Diya', 'Vihaan', 'Ananya', 'Arjun', 'Ishita', 'Kabir', 'Meera', 'Rohan', 'Saanvi', 'Aditya', 'Kavya', 'Nikhil', 'Priya', 'Rahul', 'Sneha', 'Vikram', 'Neha', 'Siddharth', 'Tanvi', 'Emma', 'Liam', 'Sofia', 'Noah', 'Hannah', 'Lucas', 'Mia', 'Yuki', 'Omar', 'Fatima', 'Chen', 'Amelia', 'Mateo', 'Zara', 'Ethan', 'Leila', 'Daniel', 'Aisha', 'Jonas', 'Nora'];
const LAST = ['Sharma', 'Patel', 'Iyer', 'Nair', 'Menon', 'Kapoor', 'Reddy', 'Gupta', 'Das', 'Joshi', 'Fernandes', 'DSouza', 'Rao', 'Khan', 'Singh', 'Mehta', 'Bose', 'Pillai', 'Chopra', 'Verma', 'Müller', 'Rossi', 'Tanaka', 'Haddad', 'Wang', 'Smith', 'García', 'Ali', 'Nguyen', 'Brown'];

const FAQ = [
  ['Check-in & check-out', 'What time is check-in?', 'Check-in starts at 2:00 pm. With online check-in you can skip the front desk entirely and go straight to your room with your digital key.', ['check-in', 'checkin', 'arrival', 'arrive', 'time']],
  ['Check-in & check-out', 'What time is check-out?', 'Check-out is at 11:00 am. You can check out from the app (Express Check-out) and your invoice is e-mailed automatically.', ['check-out', 'checkout', 'leave', 'departure', 'time']],
  ['Check-in & check-out', 'Can I get a late checkout?', 'Late check-out until 2:00 pm can be arranged for ₹1,500, subject to availability. Just ask me to request it and the front desk will confirm.', ['late', 'checkout', 'extend']],
  ['Check-in & check-out', 'Can I check in early?', 'Early check-in from 10:00 am is ₹1,500, subject to room readiness. Ask me to request it and we will confirm.', ['early', 'check-in']],
  ['Dining', 'Where is the restaurant?', 'Saffron & Sea, our all-day restaurant, is on the ground floor beside the lobby, open 6:30 am to 11:00 pm. The rooftop bar Horizon (level 7) is open 5 pm to 1 am.', ['restaurant', 'dining', 'eat', 'food', 'dinner', 'lunch', 'bar']],
  ['Dining', 'What time is breakfast?', 'Breakfast is served at Saffron & Sea from 6:30 to 10:30 am on weekdays and until 11:00 am on weekends.', ['breakfast', 'morning', 'buffet']],
  ['Dining', 'Is room service available?', 'In-room dining is available 24 hours. Use the in-room tablet, dial 7 from your room phone, or ask me to place a request.', ['room service', 'in-room dining', 'order', '24']],
  ['Facilities', 'What amenities are available?', 'Guests enjoy an infinity pool (level 7), a 24-hour gym, the Solace Spa, high-speed Wi-Fi, a business centre, valet parking and a kids’ club on weekends.', ['amenities', 'facilities', 'services', 'offer']],
  ['Facilities', 'Is there a swimming pool?', 'Yes — the rooftop infinity pool on level 7 is open 6:00 am to 9:00 pm. Towels are provided poolside.', ['pool', 'swim', 'swimming']],
  ['Facilities', 'Is there a gym?', 'Our fitness centre on level 2 is open 24 hours with your digital key. Yoga sessions run daily at 7 am.', ['gym', 'fitness', 'workout', 'exercise', 'yoga']],
  ['Facilities', 'Do you have a spa?', 'Solace Spa (level 2) offers massages and facials from 10 am to 9 pm. Treatments start at ₹3,500 — ask me to book one.', ['spa', 'massage', 'facial', 'treatment']],
  ['Facilities', 'What is the Wi-Fi password?', 'Connect to "SolsticeBay-Guest" and sign in with your room number and last name. Wi-Fi is free throughout the hotel.', ['wifi', 'wi-fi', 'internet', 'password', 'network']],
  ['Facilities', 'Is parking available?', 'Valet parking is available for ₹500 per night; EV charging points are in the basement car park.', ['parking', 'car', 'valet', 'ev']],
  ['Policies', 'What is the cancellation policy?', 'Cancellation is free up to 48 hours before check-in. Cancellations within 48 hours are charged one night.', ['cancel', 'cancellation', 'refund', 'policy']],
  ['Policies', 'Are pets allowed?', 'We welcome small dogs and cats under 10 kg in selected rooms for ₹1,000 per stay. Please let us know in advance.', ['pet', 'pets', 'dog', 'cat']],
  ['Policies', 'Is smoking allowed?', 'All rooms are non-smoking. A designated smoking area is available on the ground-floor garden terrace.', ['smoke', 'smoking', 'cigarette']],
  ['Policies', 'Which payment methods do you accept?', 'We accept cards, UPI, net banking and major wallets. Foreign cards are charged in INR at the day’s exchange rate.', ['payment', 'pay', 'card', 'upi', 'currency']],
  ['Policies', 'Do you have accessible rooms?', 'Yes. Our Accessible Deluxe rooms have step-free access, roll-in showers, grab rails and visual alarms. Add your needs to your profile and we will allocate one automatically.', ['accessible', 'wheelchair', 'disability', 'accessibility']],
  ['Digital key', 'How does the digital key work?', 'After online check-in your key appears in the app. Hold your phone near the door lock (NFC) or show the QR code to the reader. It works until 1 hour after check-out time.', ['digital', 'key', 'unlock', 'door', 'phone', 'nfc', 'qr']],
  ['Digital key', 'I lost my phone or my key is not working', 'Please visit the front desk — a physical master key is always available and we can re-issue your digital key immediately.', ['lost', 'key', 'not working', 'locked out']],
  ['Loyalty', 'How do loyalty points work?', 'You earn 5 points per ₹100 of room charges (more at Gold and Platinum tiers), credited after check-out. Redeem them when booking at 1 point = ₹1.', ['loyalty', 'points', 'rewards', 'tier', 'gold', 'platinum']],
  ['Services', 'Is laundry service available?', 'Same-day laundry and pressing are available if handed in before 10 am. Bags are in your wardrobe.', ['laundry', 'washing', 'iron', 'pressing', 'dry clean']],
  ['Services', 'Can you arrange an airport transfer?', 'Yes — a private sedan to or from the airport is ₹1,800 one way. Ask me to book it with your flight time.', ['airport', 'transfer', 'taxi', 'pickup', 'cab']],
  ['Local', 'What is there to do nearby?', 'The Marine Promenade is a 5-minute walk, the Old Fort museum is 15 minutes away, and the Harbour Market is great for evening food stalls.', ['nearby', 'attractions', 'things to do', 'sightseeing', 'visit', 'explore', 'local']],
  ['Local', 'Where can I go shopping?', 'Bayfront Mall is 10 minutes by car; for handicrafts try the Artisans’ Lane market, open until 9 pm.', ['shopping', 'shop', 'mall', 'market', 'buy']],
  ['Local', 'Can you recommend a restaurant outside the hotel?', 'Locals love Coastline Kitchen for seafood (7 min walk) and Masala Street for regional thalis (10 min drive). We can reserve a table for you.', ['recommend', 'restaurant outside', 'local food', 'seafood', 'eat out']],
];

async function main() {
  const today = hotelToday();
  console.log(`[seed] Resetting data (hotel date ${today.toISOString().slice(0, 10)})...`);
  // wipe in dependency order
  const tables = ['room_access_logs', 'digital_keys', 'invoices', 'payments', 'loyalty_transactions', 'service_requests', 'ai_conversations', 'channel_syncs', 'mock_ota_bookings', 'reservations', 'rooms', 'room_types', 'ota_channels', 'notifications', 'audit_logs', 'reports', 'user_sessions', 'password_reset_tokens', 'loyalty_accounts', 'guest_profiles', 'guests', 'staff_members', 'users', 'role_permissions', 'permissions', 'roles', 'faq_entries', 'system_settings', 'exchange_rates'];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "reservation_number_seq" RESTART WITH 1`);
  const ledger = {};

  // ---- RBAC --------------------------------------------------------------------------
  const roleDescriptions = {
    [ROLES.GUEST]: 'Registered end user who searches, books and manages hotel stays (SRS 2.3, favoured user class)',
    [ROLES.RECEPTIONIST]: 'Front-desk staff: reservations, check-in/out, OTA conflicts, escalated guest requests',
    [ROLES.HOTEL_MANAGER]: 'Oversees operations: dashboards, reports, rates and room inventory',
    [ROLES.FINANCE_STAFF]: 'Verifies payments, reconciles revenue, invoices and financial reports',
    [ROLES.SYSTEM_ADMINISTRATOR]: 'Manages users, roles, permissions, configuration, OTA connections and audit logs',
  };
  const perms = {};
  for (const [name, description] of Object.entries(PERMISSIONS)) perms[name] = await prisma.permission.create({ data: { permissionName: name, description } });
  const roles = {};
  for (const [roleName, grants] of Object.entries(DEFAULT_GRANTS)) {
    roles[roleName] = await prisma.role.create({ data: { roleName, description: roleDescriptions[roleName] } });
    await prisma.rolePermission.createMany({ data: grants.map((g) => ({ roleId: roles[roleName].id, permissionId: perms[g].id })) });
  }

  // ---- Users -------------------------------------------------------------------------
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const staffDefs = [
    ['Rhea Kapoor', 'admin@hrms.test', ROLES.SYSTEM_ADMINISTRATOR, 'AD-1001', 'IT & Systems'],
    ['Vikram Menon', 'manager@hrms.test', ROLES.HOTEL_MANAGER, 'MG-1001', 'Operations'],
    ['Anita Desai', 'finance@hrms.test', ROLES.FINANCE_STAFF, 'FN-1001', 'Finance'],
    ['Karan Mehta', 'reception@hrms.test', ROLES.RECEPTIONIST, 'FD-1001', 'Front Office'],
    ['Pooja Rao', 'reception2@hrms.test', ROLES.RECEPTIONIST, 'FD-1002', 'Front Office'],
  ];
  const staff = {};
  for (const [name, email, role, employeeId, department] of staffDefs) {
    const u = await prisma.user.create({ data: { name, email, phone: `+91 98${between(10000000, 99999999)}`, passwordHash, roleId: roles[role].id, lastLoginAt: addDays(new Date(), -1) } });
    await prisma.staffMember.create({ data: { userId: u.id, employeeId, department } });
    staff[email] = u;
  }

  const guestIdFor = () => Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[between(0, 31)]).join('');
  const guests = [];
  async function makeGuest(name, email, extra = {}) {
    const u = await prisma.user.create({ data: { name, email, phone: `+91 9${between(100000000, 999999999)}`, passwordHash, roleId: roles[ROLES.GUEST].id, createdAt: addDays(new Date(), -between(70, 400)), lastLoginAt: extra.neverLoggedIn ? null : addDays(new Date(), -between(1, 30)) } });
    const g = await prisma.guest.create({ data: { userId: u.id, guestId: guestIdFor() } });
    await prisma.guestProfile.create({ data: { guestId: g.id, nationality: extra.nationality ?? 'Indian', preferences: extra.preferences ?? {}, accessibilityNeeds: extra.accessibilityNeeds ?? null, dateOfBirth: extra.dob ?? null, address: extra.address ?? null } });
    await prisma.loyaltyAccount.create({ data: { guestId: g.id } });
    const guest = { ...g, user: u };
    guests.push(guest);
    return guest;
  }
  const demoGuest = await makeGuest('Aarav Sharma', 'guest@hrms.test', { preferences: { floor: 'HIGH', view: 'Sea', bedType: 'King', quiet: true, onboardingDone: true }, dob: new Date(Date.UTC(1994, 4, 12)), address: '14 Carter Road, Bandra West, Mumbai 400050' });
  const demoGuest2 = await makeGuest('Meera Iyer', 'meera@hrms.test', { preferences: { floor: 'LOW', view: 'Garden', onboardingDone: true }, accessibilityNeeds: 'Wheelchair user — step-free room and roll-in shower' });
  await makeGuest('Liam Brown', 'liam@hrms.test', { nationality: 'British', preferences: { bedType: 'Twin' } });
  for (let i = 0; i < 42; i++) {
    const first = FIRST[i % FIRST.length];
    const last = pick(LAST);
    await makeGuest(`${first} ${last}`, `${first.toLowerCase()}.${last.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}${i}@example.com`, { nationality: pick(['Indian', 'Indian', 'Indian', 'British', 'German', 'Japanese', 'American', 'Emirati']), preferences: rand() < 0.5 ? { floor: pick(['HIGH', 'LOW']), view: pick(['Sea', 'City', 'Garden']) } : {} });
  }

  // ---- Settings, KB, OTA channels ----------------------------------------------------
  await prisma.faqEntry.createMany({ data: FAQ.map(([category, question, answer, keywords]) => ({ category, question, answer, keywords })) });
  const channels = [];
  for (const [channelName, code, apiEndpoint, commissionPercent] of [
    ['OTA Platform A', 'OTAA', 'https://api.ota-platform-a.example/v2', 15],
    ['OTA Platform B', 'OTAB', 'https://partners.ota-platform-b.example/api', 18],
    ['OTA Platform C', 'OTAC', 'https://connect.ota-platform-c.example/rest', 12],
  ]) channels.push(await prisma.oTAChannel.create({ data: { channelName, code, apiEndpoint, commissionPercent, lastSyncAt: new Date() } }));

  // ---- Rooms --------------------------------------------------------------------------
  const types = {};
  for (const t of ROOM_TYPES) types[t.typeName] = await prisma.roomType.create({ data: t });
  const rooms = [];
  for (const [roomNumber, typeName, floor, capacity, view, accessible, features] of ROOMS) {
    rooms.push(await prisma.room.create({ data: { roomNumber, roomTypeId: types[typeName].id, floor, capacity, view, accessible, features, baseRate: types[typeName].baseRate, status: 'AVAILABLE' } }));
  }
  const roomByNo = Object.fromEntries(rooms.map((r) => [r.roomNumber, r]));

  // ---- Reservations -------------------------------------------------------------------
  let reservationNumber = 0;
  const created = [];
  const plan = []; // { room, guest, checkIn, checkOut, forceStatus, source, channel }

  // Scripted stays for the demo guests (placed first so random stays avoid them)
  plan.push({ room: roomByNo['502'], guest: demoGuest, checkIn: addDays(today, -26), checkOut: addDays(today, -23), forceStatus: 'CHECKED_OUT', source: 'DIRECT', scripted: 'history' });
  plan.push({ room: roomByNo['403'], guest: demoGuest, checkIn: addDays(today, -58), checkOut: addDays(today, -55), forceStatus: 'CHECKED_OUT', source: 'AI_CONCIERGE', scripted: 'history' });
  plan.push({ room: roomByNo['305'], guest: demoGuest, checkIn: today, checkOut: addDays(today, 2), forceStatus: 'CONFIRMED', source: 'DIRECT', scripted: 'arriving-today', numGuests: 2, specialRequests: 'Celebrating an anniversary — a quiet room please.' });
  plan.push({ room: roomByNo['401'], guest: demoGuest, checkIn: addDays(today, 12), checkOut: addDays(today, 15), forceStatus: 'CONFIRMED', source: 'DIRECT', scripted: 'future' });
  plan.push({ room: roomByNo['105'], guest: demoGuest2, checkIn: addDays(today, -1), checkOut: addDays(today, 2), forceStatus: 'CHECKED_IN', source: 'RECEPTIONIST', scripted: 'in-house' });
  plan.push({ room: roomByNo['203'], guest: guests[5], checkIn: addDays(today, 5), checkOut: addDays(today, 8), forceStatus: 'CONFIRMED', source: 'DIRECT', scripted: 'conflict-target' });
  plan.push({ room: roomByNo['302'], guest: guests[8], checkIn: addDays(today, 3), checkOut: addDays(today, 6), forceStatus: 'CONFIRMED', source: 'RECEPTIONIST', scripted: 'conflict-target-2' });

  const taken = (room, ci, co) => plan.some((p) => p.room.id === room.id && p.checkIn < co && p.checkOut > ci);
  const roomsForRandom = rooms.filter((r) => r.roomNumber !== '305'); // keep 305 clear around the demo stay
  for (const room of rooms) {
    let d = addDays(today, -62 + between(0, 3));
    while (d < addDays(today, 30)) {
      const nights = between(1, 5);
      const ci = d;
      const co = addDays(d, nights);
      const occupancyBias = room.roomNumber.startsWith('6') ? 0.45 : 0.72;
      if (rand() < occupancyBias && !taken(room, ci, co) && (roomsForRandom.includes(room) || co <= addDays(today, -3) || ci >= addDays(today, 4))) {
        const src = rand();
        const source = src < 0.43 ? 'DIRECT' : src < 0.78 ? 'OTA' : src < 0.94 ? 'RECEPTIONIST' : 'AI_CONCIERGE';
        plan.push({ room, guest: guests[between(2, guests.length - 1)], checkIn: ci, checkOut: co, source, channel: source === 'OTA' ? pick(channels) : null });
      }
      d = addDays(co, between(0, 3));
    }
  }
  plan.sort((a, b) => a.checkIn - b.checkIn);

  const now = new Date();
  for (const p of plan) {
    const nights = nightsBetween(p.checkIn, p.checkOut);
    let status = p.forceStatus;
    if (!status) {
      if (p.checkOut <= today) status = rand() < 0.1 ? 'CANCELLED' : 'CHECKED_OUT';
      else if (p.checkIn <= today) status = p.checkIn.getTime() === today.getTime() && rand() < 0.5 ? 'CONFIRMED' : 'CHECKED_IN';
      else status = rand() < 0.12 ? 'CANCELLED' : 'CONFIRMED';
    }
    const rate = Number(p.room.baseRate);
    const room = r2(rate * nights);
    const total = r2(room * (1 + TAX / 100));
    const lead = between(1, 35);
    let createdAt = new Date(Math.min(now.getTime() - between(1, 36) * 3600_000, addDays(p.checkIn, -lead).getTime() + between(8, 20) * 3600_000));
    if (p.scripted === 'future' || p.scripted === 'arriving-today') createdAt = addDays(now, -between(6, 10));
    const numGuests = p.numGuests ?? Math.min(p.room.capacity, between(1, 3));
    const cancelled = status === 'CANCELLED';
    const cancelledAt = cancelled ? new Date(Math.min(now.getTime() - 3600_000, Math.max(createdAt.getTime() + 3600_000, addDays(p.checkIn, -between(0, 10)).getTime()))) : null;
    const lateCancel = cancelled && (atHotelTime(p.checkIn, '14:00') - cancelledAt) / 3600_000 < 48;
    const fee = lateCancel ? r2(total / nights) : 0;
    const resNo = ++reservationNumber;
    const res = await prisma.reservation.create({
      data: {
        reservationNumber: resNo, guestId: p.guest.id, roomId: p.room.id, checkInDate: p.checkIn, checkOutDate: p.checkOut, numGuests,
        status, totalAmount: total, currency: 'INR', source: p.source, otaChannelId: p.channel?.id ?? null,
        externalRef: p.channel ? `${p.channel.code}-${crypto.randomBytes(3).toString('hex').toUpperCase()}` : null,
        specialRequests: p.specialRequests ?? (p.channel ? `Booked via ${p.channel.channelName}` : rand() < 0.2 ? pick(['Extra pillows please', 'Late arrival around 11 pm', 'High floor if possible', 'Celebrating a birthday', 'Vegetarian breakfast']) : null),
        confirmedAt: createdAt, createdAt,
        checkedInAt: ['CHECKED_IN', 'CHECKED_OUT'].includes(status) ? atHotelTime(p.checkIn, `${between(13, 20)}:${pick(['05', '20', '35', '50'])}`) : null,
        checkedOutAt: status === 'CHECKED_OUT' ? atHotelTime(p.checkOut, `${between(8, 10)}:${pick(['10', '25', '40', '55'])}`) : null,
        identityVerifiedAt: ['CHECKED_IN', 'CHECKED_OUT'].includes(status) ? atHotelTime(p.checkIn, '14:00') : null,
        identityDocument: ['CHECKED_IN', 'CHECKED_OUT'].includes(status) ? pick(['Passport ••••', 'Aadhaar ••••', 'Driving licence ••••']) + between(1000, 9999) : null,
        cancelledAt, cancellationReason: cancelled ? pick(['Cancelled by guest', 'Change of travel plans', 'Cancelled by guest', p.channel ? `Cancelled on ${p.channel.channelName}` : 'Flight cancelled']) : null,
        cancellationFee: fee, createdById: p.source === 'RECEPTIONIST' ? staff['reception@hrms.test'].id : p.source === 'OTA' ? null : p.guest.userId,
      },
    });
    created.push({ ...res, plan: p });

    // Reservation payment (+ refund on cancellation)
    const method = p.channel ? 'CARD' : pick(['CARD', 'CARD', 'UPI', 'UPI', 'NET_BANKING', 'WALLET']);
    const transactionRef = p.channel ? `ota_${p.channel.code}_${res.externalRef}` : txnId();
    const refunded = cancelled ? r2(total - fee) : 0;
    await prisma.payment.create({
      data: {
        reservationId: res.id, amount: total, currency: 'INR', paymentMethod: method, purpose: 'RESERVATION', status: cancelled && fee === 0 ? 'REFUNDED' : 'CAPTURED',
        paidAt: createdAt, transactionRef, refundedAmount: refunded, createdAt,
        methodSummary: p.channel ? `Collected by ${p.channel.channelName}` : method === 'CARD' ? `${pick(['Visa', 'Mastercard', 'RuPay'])} •••• ${between(1000, 9999)}` : method === 'UPI' ? `UPI ${pick(['aa', 'ri', 'sk', 'mv'])}•••@${pick(['okhdfc', 'okaxis', 'ybl'])}` : method === 'NET_BANKING' ? `Net banking · ${pick(['HDFC Bank', 'SBI', 'ICICI Bank'])}` : `Wallet · ${pick(['Paytm', 'PhonePe', 'Amazon Pay'])}`,
        verifiedById: status === 'CHECKED_OUT' && rand() < 0.7 ? staff['finance@hrms.test'].id : null,
        verifiedAt: status === 'CHECKED_OUT' ? addDays(createdAt, 1) : null,
        reconciled: status === 'CHECKED_OUT' && p.checkOut < addDays(today, -7),
      },
    });
    if (!p.channel) {
      ledger[transactionRef] = { transactionId: transactionRef, amount: total, currency: 'INR', method, reference: `RES-${res.id}`, state: refunded ? (refunded >= total ? 'REFUNDED' : 'PARTIALLY_REFUNDED') : 'CAPTURED', refunded: refunded || undefined, createdAt: createdAt.toISOString(), capturedAt: createdAt.toISOString() };
    }
    if (cancelled) {
      await prisma.auditLog.create({ data: { action: 'RESERVATION_CANCELLED', entityType: 'Reservation', entityId: String(res.id), performedBy: p.guest.userId, timestamp: cancelledAt, details: { cancellationFee: fee, refundAmount: refunded } } });
    }
    await prisma.auditLog.create({ data: { action: p.channel ? 'OTA_BOOKING_IMPORTED' : 'RESERVATION_CONFIRMED', entityType: 'Reservation', entityId: String(res.id), performedBy: p.channel ? null : p.guest.userId, timestamp: createdAt, details: { reservationNumber: resNo, amount: total, channel: p.channel?.channelName } } });
    if (p.channel) {
      await prisma.mockOtaBooking.create({ data: { channelId: p.channel.id, externalRef: res.externalRef, roomNumber: p.room.roomNumber, guestName: p.guest.user.name, guestEmail: p.guest.user.email, checkInDate: p.checkIn, checkOutDate: p.checkOut, numGuests, amount: total, status: cancelled ? 'CANCELLED' : 'BOOKED', hrmsStatus: cancelled ? 'CANCELLED' : 'CONFIRMED', pendingSync: false, pulledAt: new Date(now.getTime() + 60_000), createdAt } });
      await prisma.channelSync.create({ data: { channelId: p.channel.id, reservationId: res.id, syncType: 'PULL_BOOKINGS', syncStatus: 'SUCCESS', lastSyncAt: new Date(createdAt.getTime() + 40_000), externalRef: res.externalRef, details: { event: 'created' } } });
    }

    // Stay artefacts
    if (['CHECKED_IN', 'CHECKED_OUT'].includes(status)) {
      const services = [];
      if (rand() < 0.45 || p.scripted) {
        const n = between(1, 2);
        for (let i = 0; i < n; i++) {
          const [category, description, charge] = pick([
            ['AMENITIES', 'Two extra towels and a bathrobe, please', 0], ['ROOM_SERVICE', 'Club sandwich and fresh lime soda', 850], ['TRANSPORT', 'Airport drop at 6 am', 1800],
            ['SPA', '60-minute aromatherapy massage', 3500], ['LATE_CHECKOUT', 'Late check-out until 2 pm', 1500], ['HOUSEKEEPING', 'Please clean the room after 1 pm', 0], ['EXTRA_BED', 'Extra bed for our child', 2000],
          ]);
          const at = new Date(Math.min(now.getTime() - 600_000, atHotelTime(addDays(p.checkIn, between(0, Math.max(0, nights - 1))), `${between(9, 21)}:15`).getTime()));
          services.push(await prisma.serviceRequest.create({ data: { guestId: p.guest.id, reservationId: res.id, category, description, charge, status: status === 'CHECKED_OUT' ? 'COMPLETED' : pick(['COMPLETED', 'IN_PROGRESS', 'OPEN']), createdAt: at, completedAt: status === 'CHECKED_OUT' ? new Date(at.getTime() + 3600_000) : null, assignedToId: staff['reception@hrms.test'].id } }));
        }
      }
      const key = await prisma.digitalKey.create({
        data: { reservationId: res.id, keyCode: `HRMS-${crypto.randomBytes(12).toString('base64url').toUpperCase()}`, keyType: pick(['QR', 'NFC']), issueDate: atHotelTime(p.checkIn, '14:00'), expiryDate: new Date(atHotelTime(p.checkOut, '11:00').getTime() + 3600_000), status: status === 'CHECKED_OUT' ? 'REVOKED' : 'ACTIVE', revokedAt: status === 'CHECKED_OUT' ? atHotelTime(p.checkOut, '10:00') : null },
      });
      for (let i = 0; i < between(2, 6); i++) {
        const at = new Date(Math.min(now.getTime() - 300_000, atHotelTime(addDays(p.checkIn, between(0, Math.max(0, nights - 1))), `${between(14, 23)}:${between(10, 59)}`).getTime()));
        await prisma.roomAccessLog.create({ data: { roomId: p.room.id, digitalKeyId: key.id, reservationId: res.id, result: 'GRANTED', reason: 'Key verified', attemptedAt: at } });
      }

      if (status === 'CHECKED_OUT') {
        const svcTotal = services.reduce((s, x) => s + Number(x.charge), 0);
        const svcTax = r2((svcTotal * TAX) / 100);
        if (svcTotal > 0) {
          const ref = txnId();
          await prisma.payment.create({ data: { reservationId: res.id, amount: r2(svcTotal + svcTax), currency: 'INR', paymentMethod: 'CARD', purpose: 'FINAL_SETTLEMENT', status: 'CAPTURED', paidAt: res.checkedOutAt, transactionRef: ref, methodSummary: `Visa •••• ${between(1000, 9999)}`, createdAt: res.checkedOutAt } });
          ledger[ref] = { transactionId: ref, amount: r2(svcTotal + svcTax), currency: 'INR', method: 'CARD', state: 'CAPTURED', createdAt: res.checkedOutAt.toISOString() };
        }
        const items = [{ description: `${p.room.roomNumber} - ${ROOMS.find((x) => x[0] === p.room.roomNumber)[1]}`, quantity: nights, unitPrice: rate, amount: room }, ...services.filter((s) => Number(s.charge) > 0).map((s) => ({ description: `${s.category}: ${s.description}`, quantity: 1, unitPrice: Number(s.charge), amount: Number(s.charge) }))];
        const subtotal = r2(items.reduce((s, i) => s + i.amount, 0));
        const tax = r2(total - room + svcTax);
        await prisma.invoice.create({ data: { reservationId: res.id, invoiceNumber: `INV-${p.checkOut.getUTCFullYear()}-${String(resNo).padStart(6, '0')}`, issueDate: res.checkedOutAt, subtotal, taxAmount: tax, totalAmount: r2(subtotal + tax), amountPaid: r2(subtotal + tax), lineItems: items, status: 'PAID', emailedAt: res.checkedOutAt } });
        // BR-6 loyalty accrual after check-out
        const acct = await prisma.loyaltyAccount.findUnique({ where: { guestId: p.guest.id } });
        const tiers = DEFAULT_SETTINGS.loyaltyTiers.value;
        const mult = tiers.find((t) => t.name === acct.tier).multiplier;
        const pts = Math.floor((room / 100) * DEFAULT_SETTINGS.loyaltyPointsPer100.value * mult);
        const lifetime = acct.lifetimePoints + pts;
        const tier = [...tiers].reverse().find((t) => lifetime >= t.minLifetimePoints).name;
        await prisma.loyaltyAccount.update({ where: { id: acct.id }, data: { pointsBalance: { increment: pts }, lifetimePoints: lifetime, tier } });
        await prisma.loyaltyTransaction.create({ data: { loyaltyAccountId: acct.id, reservationId: res.id, type: 'ACCRUAL', points: pts, description: `Stay HRMS-${String(resNo).padStart(6, '0')} (${nights} night${nights === 1 ? '' : 's'})`, createdAt: res.checkedOutAt } });
        await prisma.auditLog.create({ data: { action: 'GUEST_CHECKED_OUT', entityType: 'Reservation', entityId: String(res.id), performedBy: staff['reception@hrms.test'].id, timestamp: res.checkedOutAt, details: { pointsAwarded: pts } } });
      }
      await prisma.auditLog.create({ data: { action: 'GUEST_CHECKED_IN', entityType: 'Reservation', entityId: String(res.id), performedBy: p.guest.userId, timestamp: res.checkedInAt, details: { channel: rand() < 0.6 ? 'online' : 'front desk' } } });
    }
  }
  await prisma.$executeRawUnsafe(`SELECT setval('reservation_number_seq', ${reservationNumber})`);

  // Give the demo guest a healthy loyalty balance (Gold tier) with an explained history
  const demoAcct = await prisma.loyaltyAccount.findUnique({ where: { guestId: demoGuest.id } });
  await prisma.loyaltyTransaction.create({ data: { loyaltyAccountId: demoAcct.id, type: 'ADJUSTMENT', points: 2400, description: 'Welcome bonus: migrated from previous loyalty programme', createdAt: addDays(now, -90) } });
  await prisma.loyaltyAccount.update({ where: { id: demoAcct.id }, data: { pointsBalance: { increment: 2400 }, lifetimePoints: { increment: 2400 }, tier: 'GOLD' } });

  // ---- OTA: pending bookings for the live sync demo (SD-3) ----------------------------
  const conflictTarget = created.find((c) => c.plan.scripted === 'conflict-target');
  const conflictTarget2 = created.find((c) => c.plan.scripted === 'conflict-target-2');
  // (1) Conflict that will be detected on the next sync: OTA B sells room 203 over an HRMS booking
  await prisma.mockOtaBooking.create({ data: { channelId: channels[1].id, externalRef: 'OTAB-7Q2K9P', roomNumber: '203', guestName: 'Sofia Rossi', guestEmail: 'sofia.rossi@example.com', checkInDate: addDays(conflictTarget.checkInDate, 1), checkOutDate: addDays(conflictTarget.checkInDate, 3), numGuests: 2, amount: r2(7200 * 2 * 1.12), status: 'BOOKED' } });
  // (2) Clean new bookings that sync will import automatically
  const freeRoom = async (ci, co, cap = 2) => {
    for (const r of rooms) {
      if (r.capacity < cap || ['305', '203', '302'].includes(r.roomNumber)) continue;
      const clash = await prisma.reservation.findFirst({ where: { roomId: r.id, status: { in: ['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN'] }, checkInDate: { lt: co }, checkOutDate: { gt: ci } } });
      if (!clash) return r;
    }
    return null;
  };
  for (const [ch, offset, n, name, email] of [[0, 9, 2, 'Hannah Müller', 'hannah.mueller@example.com'], [2, 16, 3, 'Omar Haddad', 'omar.haddad@example.com']]) {
    const ci = addDays(today, offset);
    const room = await freeRoom(ci, addDays(ci, n));
    if (room) await prisma.mockOtaBooking.create({ data: { channelId: channels[ch].id, externalRef: `${channels[ch].code}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`, roomNumber: room.roomNumber, guestName: name, guestEmail: email, checkInDate: ci, checkOutDate: addDays(ci, n), numGuests: 2, amount: r2(Number(room.baseRate) * n * 1.12), status: 'BOOKED' } });
  }
  // (3) An already-flagged open conflict waiting for a Receptionist (OTA A over room 302)
  const b3 = await prisma.mockOtaBooking.create({ data: { channelId: channels[0].id, externalRef: 'OTAA-M4X8TD', roomNumber: '302', guestName: 'Yuki Tanaka', guestEmail: 'yuki.tanaka@example.com', checkInDate: addDays(conflictTarget2.checkInDate, 0), checkOutDate: addDays(conflictTarget2.checkInDate, 2), numGuests: 2, amount: r2(7200 * 2 * 1.12), status: 'BOOKED', hrmsStatus: 'PENDING_RECONCILIATION', pendingSync: false, pulledAt: new Date(now.getTime() + 60_000) } });
  await prisma.channelSync.create({
    data: {
      channelId: channels[0].id, syncType: 'PULL_BOOKINGS', syncStatus: 'CONFLICT', externalRef: b3.externalRef, conflictType: 'ROOM_ALREADY_BOOKED', conflictReservationId: conflictTarget2.id, lastSyncAt: addDays(now, 0),
      errorMessage: `OTA says room 302 is booked ${b3.checkInDate.toISOString().slice(0, 10)} → ${b3.checkOutDate.toISOString().slice(0, 10)}, but HRMS already holds it for ${conflictTarget2.plan.guest.user.name}.`,
      details: { otaBooking: { externalRef: b3.externalRef, roomNumber: '302', guestName: b3.guestName, guestEmail: b3.guestEmail, checkInDate: b3.checkInDate.toISOString().slice(0, 10), checkOutDate: b3.checkOutDate.toISOString().slice(0, 10), numGuests: 2, amount: Number(b3.amount) }, isModification: false },
    },
  });
  // (4) A historic, resolved conflict for the audit trail
  await prisma.channelSync.create({ data: { channelId: channels[2].id, syncType: 'PULL_BOOKINGS', syncStatus: 'RESOLVED', externalRef: 'OTAC-H2B7LQ', conflictType: 'ROOM_OUT_OF_SERVICE', lastSyncAt: addDays(now, -9), errorMessage: 'Room 404 is maintenance in HRMS.', resolution: 'REASSIGN_ROOM', resolutionNote: 'Moved to 403 (same category), guest informed by OTA.', resolvedById: staff['reception@hrms.test'].id, resolvedAt: addDays(now, -9), details: {} } });
  for (let i = 0; i < 40; i++) {
    const ch = channels[i % 3];
    await prisma.channelSync.create({ data: { channelId: ch.id, syncType: pick(['PUSH_AVAILABILITY', 'PUSH_AVAILABILITY', 'PUSH_RATES', 'PULL_BOOKINGS']), syncStatus: i === 17 ? 'FAILED' : 'SUCCESS', lastSyncAt: new Date(now.getTime() - i * 37 * 60_000), errorMessage: i === 17 ? 'OTA Platform C API is not responding (HTTP 503)' : null, details: { reason: 'Scheduled inventory sync' } } });
  }

  // ---- Reconciliation exceptions (Finance demo) ---------------------------------------
  const recentPaid = await prisma.payment.findMany({ where: { status: 'CAPTURED', NOT: { transactionRef: { startsWith: 'ota_' } }, reservation: { status: 'CHECKED_OUT' } }, orderBy: { paidAt: 'desc' }, take: 6 });
  if (recentPaid[0]) { ledger[recentPaid[0].transactionRef].state = 'PARTIALLY_REFUNDED'; ledger[recentPaid[0].transactionRef].refunded = 500; } // chargeback / partial refund at gateway
  if (recentPaid[1]) delete ledger[recentPaid[1].transactionRef]; // missing in settlement report
  const orphan = txnId();
  ledger[orphan] = { transactionId: orphan, amount: 3136, currency: 'INR', method: 'CARD', state: 'CAPTURED', reference: 'UNKNOWN', createdAt: addDays(now, -2).toISOString() };

  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));

  // ---- Guest services, concierge, notifications ---------------------------------------
  const inHouse = await prisma.reservation.findFirst({ where: { guestId: demoGuest2.id, status: 'CHECKED_IN' } });
  const conv = await prisma.aIConversation.create({ data: { guestId: demoGuest2.id, sessionId: crypto.randomUUID(), query: 'Is there a physiotherapist who can visit my room tomorrow?', response: "I'm not certain about that one, so I've passed your question to our front-desk team. A receptionist will reply shortly.", intent: 'ESCALATED', source: 'ESCALATED', resolved: false, timestamp: new Date(now.getTime() - 50 * 60_000) } });
  await prisma.serviceRequest.create({ data: { guestId: demoGuest2.id, reservationId: inHouse.id, conversationId: conv.id, category: 'CONCIERGE_ESCALATION', description: conv.query, isEscalation: true, status: 'OPEN', createdAt: conv.timestamp } });
  await prisma.serviceRequest.create({ data: { guestId: demoGuest2.id, reservationId: inHouse.id, category: 'AMENITIES', description: 'Shower chair and extra pillows, please', status: 'OPEN', createdAt: new Date(now.getTime() - 20 * 60_000) } });
  const session = crypto.randomUUID();
  for (const [q, a, intent] of [
    ['What time is check-in?', FAQ[0][2], 'FAQ'],
    ['Where is the restaurant?', FAQ[4][2], 'FAQ'],
    ['What is there to do nearby?', FAQ[23][2], 'LOCAL_RECOMMENDATION'],
  ]) await prisma.aIConversation.create({ data: { guestId: demoGuest.id, sessionId: session, query: q, response: a, intent, source: 'KNOWLEDGE_BASE', resolved: true, timestamp: addDays(now, -3) } });

  const demoRes = created.find((c) => c.plan.scripted === 'arriving-today');
  for (const [userId, channel, type, subject, body, ago] of [
    [demoGuest.userId, 'EMAIL', 'BOOKING_CONFIRMED', `Booking confirmed · HRMS-${String(demoRes.reservationNumber).padStart(6, '0')}`, `Your Deluxe King (room 305) is confirmed. Check-in from 14:00.`, 8 * 24],
    [demoGuest.userId, 'IN_APP', 'CHECKIN_REMINDER', 'Online check-in is open', `Your stay HRMS-${String(demoRes.reservationNumber).padStart(6, '0')} starts today. Check in online to get your digital key.`, 2],
    [demoGuest.userId, 'IN_APP', 'LOYALTY', 'You reached Gold tier', 'Enjoy 25% bonus points on every stay.', 20 * 24],
    [staff['reception@hrms.test'].id, 'IN_APP', 'OTA_CONFLICT', 'Booking conflict from OTA Platform A', 'Room 302 was sold on OTA Platform A over an existing HRMS reservation.', 1],
    [staff['reception@hrms.test'].id, 'IN_APP', 'AI_ESCALATION', 'Guest question needs a human (Meera Iyer)', conv.query, 1],
  ]) await prisma.notification.create({ data: { userId, channel, type, recipient: channel === 'EMAIL' ? 'guest@hrms.test' : `user:${userId}`, subject, body, createdAt: new Date(now.getTime() - ago * 3600_000) } });

  // Room operational status
  await prisma.room.update({ where: { id: roomByNo['104'].id }, data: { status: 'MAINTENANCE' } });
  const board = await prisma.room.findMany();
  for (const r of board) {
    if (r.status === 'MAINTENANCE') continue;
    const inHouseCount = await prisma.reservation.count({ where: { roomId: r.id, status: 'CHECKED_IN' } });
    const arriving = await prisma.reservation.count({ where: { roomId: r.id, status: 'CONFIRMED', checkInDate: today } });
    const departed = await prisma.reservation.count({ where: { roomId: r.id, status: 'CHECKED_OUT', checkOutDate: today } });
    await prisma.room.update({ where: { id: r.id }, data: { status: inHouseCount ? 'OCCUPIED' : arriving ? 'RESERVED' : departed ? 'CLEANING' : 'AVAILABLE' } });
  }

  for (const [action, who, details] of [
    ['LOGIN_SUCCESS', staff['admin@hrms.test'].id, {}], ['SETTING_CHANGED', staff['admin@hrms.test'].id, { key: 'otaSyncIntervalSeconds', from: 60, to: 30 }],
    ['RATE_CHANGED', staff['manager@hrms.test'].id, { typeName: 'Junior Suite', from: 11800, to: 12500 }], ['USER_CREATED', staff['admin@hrms.test'].id, { email: 'reception2@hrms.test', role: 'Receptionist' }],
    ['REVENUE_RECONCILED', staff['finance@hrms.test'].id, { matched: 180, exceptions: 0 }],
  ]) await prisma.auditLog.create({ data: { action, entityType: action.startsWith('RATE') ? 'RoomType' : action.startsWith('SETTING') ? 'SystemSetting' : 'User', entityId: '1', performedBy: who, details, timestamp: addDays(now, -between(2, 12)) } });

  const counts = await Promise.all([prisma.user.count(), prisma.room.count(), prisma.reservation.count(), prisma.payment.count(), prisma.invoice.count(), prisma.mockOtaBooking.count()]);
  console.log(`[seed] Done: ${counts[0]} users, ${counts[1]} rooms, ${counts[2]} reservations, ${counts[3]} payments, ${counts[4]} invoices, ${counts[5]} OTA platform bookings.`);
  console.log(`[seed] Demo password for every account: ${DEMO_PASSWORD}  (see docs/DEMO_ACCOUNTS.md)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
