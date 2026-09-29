import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { AppShell } from './components/layout/AppShell.jsx';
import { Spinner } from './components/ui/index.js';

const p = (loader) => lazy(loader);
// Public
const Landing = p(() => import('./pages/public/Landing.jsx'));
const Login = p(() => import('./pages/public/Login.jsx'));
const Register = p(() => import('./pages/public/Register.jsx'));
const ForgotPassword = p(() => import('./pages/public/ForgotPassword.jsx'));
const ResetPassword = p(() => import('./pages/public/ResetPassword.jsx'));
const Help = p(() => import('./pages/public/Help.jsx'));
const Traceability = p(() => import('./pages/public/Traceability.jsx'));
// Guest
const GuestHome = p(() => import('./pages/guest/GuestHome.jsx'));
const SearchRooms = p(() => import('./pages/guest/SearchRooms.jsx'));
const BookRoom = p(() => import('./pages/guest/BookRoom.jsx'));
const MyReservations = p(() => import('./pages/guest/MyReservations.jsx'));
const ReservationDetail = p(() => import('./pages/shared/ReservationDetail.jsx'));
const CheckIn = p(() => import('./pages/guest/CheckIn.jsx'));
const DigitalKeyPage = p(() => import('./pages/guest/DigitalKey.jsx'));
const CheckOut = p(() => import('./pages/guest/CheckOut.jsx'));
const Concierge = p(() => import('./pages/guest/Concierge.jsx'));
const ServiceRequests = p(() => import('./pages/guest/ServiceRequests.jsx'));
const Loyalty = p(() => import('./pages/guest/Loyalty.jsx'));
const Profile = p(() => import('./pages/guest/Profile.jsx'));
const Notifications = p(() => import('./pages/guest/Notifications.jsx'));
// Front desk
const FrontDeskHome = p(() => import('./pages/frontdesk/FrontDeskHome.jsx'));
const Reservations = p(() => import('./pages/frontdesk/Reservations.jsx'));
const RoomBoard = p(() => import('./pages/frontdesk/RoomBoard.jsx'));
const ChannelConflicts = p(() => import('./pages/frontdesk/ChannelConflicts.jsx'));
const ServiceDesk = p(() => import('./pages/frontdesk/ServiceDesk.jsx'));
const Guests = p(() => import('./pages/frontdesk/Guests.jsx'));
// Manager
const Dashboard = p(() => import('./pages/manager/Dashboard.jsx'));
const Reports = p(() => import('./pages/manager/Reports.jsx'));
const RatesInventory = p(() => import('./pages/manager/RatesInventory.jsx'));
// Finance
const Payments = p(() => import('./pages/finance/Payments.jsx'));
const Reconciliation = p(() => import('./pages/finance/Reconciliation.jsx'));
const Invoices = p(() => import('./pages/finance/Invoices.jsx'));
// Admin
const AdminUsers = p(() => import('./pages/admin/Users.jsx'));
const AdminRoles = p(() => import('./pages/admin/Roles.jsx'));
const AdminSettings = p(() => import('./pages/admin/Settings.jsx'));
const AdminChannels = p(() => import('./pages/admin/Channels.jsx'));
const AuditLogs = p(() => import('./pages/admin/AuditLogs.jsx'));
const Outbox = p(() => import('./pages/admin/Outbox.jsx'));

function Loading() {
  return <div className="grid min-h-[60vh] place-items-center"><Spinner className="size-7" /></div>;
}

/** Client-side route guard (convenience only — the API enforces every permission). */
function RequireRole({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={user.home} replace />;
  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? <Navigate to={user.home} replace /> : <Landing />;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<RequireRole><AppShell /></RequireRole>}>
          <Route path="/help" element={<Help />} />
          <Route path="/traceability" element={<Traceability />} />
        </Route>

        <Route path="/guest" element={<RequireRole roles={['Guest']}><AppShell /></RequireRole>}>
          <Route index element={<GuestHome />} />
          <Route path="search" element={<SearchRooms />} />
          <Route path="book" element={<BookRoom />} />
          <Route path="reservations" element={<MyReservations />} />
          <Route path="reservations/:id" element={<ReservationDetail />} />
          <Route path="reservations/:id/check-in" element={<CheckIn />} />
          <Route path="reservations/:id/check-out" element={<CheckOut />} />
          <Route path="key" element={<DigitalKeyPage />} />
          <Route path="concierge" element={<Concierge />} />
          <Route path="requests" element={<ServiceRequests />} />
          <Route path="loyalty" element={<Loyalty />} />
          <Route path="profile" element={<Profile />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>

        <Route path="/front-desk" element={<RequireRole roles={['Receptionist']}><AppShell /></RequireRole>}>
          <Route index element={<FrontDeskHome />} />
          <Route path="reservations" element={<Reservations />} />
          <Route path="reservations/:id" element={<ReservationDetail />} />
          <Route path="rooms" element={<RoomBoard />} />
          <Route path="channels" element={<ChannelConflicts />} />
          <Route path="requests" element={<ServiceDesk />} />
          <Route path="guests" element={<Guests />} />
          <Route path="search" element={<SearchRooms />} />
          <Route path="book" element={<BookRoom />} />
          <Route path="reservations/:id/check-out" element={<CheckOut />} />
        </Route>

        <Route path="/manager" element={<RequireRole roles={['Hotel Manager']}><AppShell /></RequireRole>}>
          <Route index element={<Dashboard />} />
          <Route path="reports" element={<Reports />} />
          <Route path="rates" element={<RatesInventory />} />
          <Route path="channels" element={<ChannelConflicts />} />
          <Route path="reservations" element={<Reservations />} />
          <Route path="reservations/:id" element={<ReservationDetail />} />
          <Route path="rooms" element={<RoomBoard />} />
          <Route path="search" element={<SearchRooms />} />
          <Route path="book" element={<BookRoom />} />
        </Route>

        <Route path="/finance" element={<RequireRole roles={['Finance Staff']}><AppShell /></RequireRole>}>
          <Route index element={<Payments />} />
          <Route path="reconcile" element={<Reconciliation />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="reports" element={<Reports financial />} />
        </Route>

        <Route path="/admin" element={<RequireRole roles={['System Administrator']}><AppShell /></RequireRole>}>
          <Route index element={<AdminUsers />} />
          <Route path="roles" element={<AdminRoles />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="channels" element={<AdminChannels />} />
          <Route path="audit" element={<AuditLogs />} />
          <Route path="outbox" element={<Outbox />} />
          <Route path="dashboard" element={<Dashboard />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

