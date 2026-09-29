import {
  Home, Search, CalendarCheck, KeyRound, MessageCircleHeart, ConciergeBell, Crown, UserCog, Bell,
  LayoutDashboard, BedDouble, Network, Users, FileBarChart, Tags, Wallet, Scale, Receipt, ShieldCheck,
  Settings2, ScrollText, Mail, CalendarDays, LifeBuoy, Workflow,
} from 'lucide-react';

/** UI-4: the interface varies by role and shows only the functions relevant to it. */
export const NAV = {
  Guest: [
    { to: '/guest', label: 'Home', icon: Home, end: true },
    { to: '/guest/search', label: 'Book a stay', icon: Search },
    { to: '/guest/reservations', label: 'My reservations', icon: CalendarCheck },
    { to: '/guest/key', label: 'Digital key', icon: KeyRound },
    { to: '/guest/concierge', label: 'AI Concierge', icon: MessageCircleHeart },
    { to: '/guest/requests', label: 'Service requests', icon: ConciergeBell },
    { to: '/guest/loyalty', label: 'Loyalty', icon: Crown },
    { to: '/guest/profile', label: 'Profile & preferences', icon: UserCog },
    { to: '/guest/notifications', label: 'Notifications', icon: Bell },
  ],
  Receptionist: [
    { to: '/front-desk', label: 'Today', icon: CalendarDays, end: true },
    { to: '/front-desk/reservations', label: 'Reservations', icon: CalendarCheck },
    { to: '/front-desk/rooms', label: 'Room board', icon: BedDouble },
    { to: '/front-desk/channels', label: 'OTA conflicts', icon: Network },
    { to: '/front-desk/requests', label: 'Service desk', icon: ConciergeBell },
    { to: '/front-desk/guests', label: 'Guests', icon: Users },
  ],
  'Hotel Manager': [
    { to: '/manager', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/manager/reports', label: 'Reports', icon: FileBarChart },
    { to: '/manager/rates', label: 'Rates & inventory', icon: Tags },
    { to: '/manager/channels', label: 'Channel manager', icon: Network },
    { to: '/manager/reservations', label: 'Reservations', icon: CalendarCheck },
    { to: '/manager/rooms', label: 'Room board', icon: BedDouble },
  ],
  'Finance Staff': [
    { to: '/finance', label: 'Payments', icon: Wallet, end: true },
    { to: '/finance/reconcile', label: 'Reconciliation', icon: Scale },
    { to: '/finance/invoices', label: 'Invoices', icon: Receipt },
    { to: '/finance/reports', label: 'Financial reports', icon: FileBarChart },
  ],
  'System Administrator': [
    { to: '/admin', label: 'Users', icon: Users, end: true },
    { to: '/admin/roles', label: 'Roles & permissions', icon: ShieldCheck },
    { to: '/admin/settings', label: 'System configuration', icon: Settings2 },
    { to: '/admin/channels', label: 'OTA connections', icon: Network },
    { to: '/admin/audit', label: 'Audit logs', icon: ScrollText },
    { to: '/admin/outbox', label: 'Notification outbox', icon: Mail },
    { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ],
};

export const COMMON_NAV = [
  { to: '/traceability', label: 'Traceability', icon: Workflow },
  { to: '/help', label: 'Help centre', icon: LifeBuoy },
];
