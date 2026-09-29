/**
 * Sign in — SRS 4.2 User.Login, User.Login.Lockout, SE-3 (optional MFA).
 * Activity: Login to HRMS -> <Valid Credentials?> -> Identify User Role and Permissions.
 */
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, Lock, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { AuthLayout } from './AuthLayout.jsx';
import { Alert, Button, Field, Input } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.jsx';

const DEMO_PASSWORD = 'Hotel@2026';
const DEMO = [
  { role: 'Guest', email: 'guest@hrms.test', who: 'Aarav Sharma · Gold member, arriving today' },
  { role: 'Receptionist', email: 'reception@hrms.test', who: 'Karan Mehta · Front office' },
  { role: 'Hotel Manager', email: 'manager@hrms.test', who: 'Vikram Menon · Operations' },
  { role: 'Finance Staff', email: 'finance@hrms.test', who: 'Anita Desai · Finance' },
  { role: 'System Administrator', email: 'admin@hrms.test', who: 'Rhea Kapoor · IT & Systems' },
];

export default function Login() {
  const { login, verifyMfa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [mfa, setMfa] = useState(null);
  const [code, setCode] = useState('');

  const finish = (result) => {
    toast.success(`Welcome, ${result.user.name.split(' ')[0]}!`);
    const from = location.state?.from;
    const target = from && from.startsWith('/guest') && result.user.role !== 'Guest' ? result.user.home : from || result.user.home;
    navigate(target, { replace: true, state: result.firstLogin ? { onboarding: true } : undefined });
  };

  const submit = async (e, creds) => {
    e?.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await login(creds?.email ?? email, creds?.password ?? password);
      if (result.mfaRequired) { setMfa(result); return; }
      finish(result);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  const submitMfa = async (e) => {
    e.preventDefault();
    setPending(true);
    try { finish(await verifyMfa(mfa.challengeId, code)); } catch (err) { setError(err); } finally { setPending(false); }
  };

  return (
    <AuthLayout
      title={mfa ? 'Two-step verification' : 'Welcome back'}
      subtitle={mfa ? 'Enter the 6-digit code we sent to your e-mail and phone.' : 'Sign in to manage your stays or your shift.'}
      aside={<div className="max-w-md text-white"><Sparkles className="mb-4 size-8 text-brass-300" /><p className="font-display text-3xl leading-snug">“Checked in from the taxi, walked straight to my room and the door opened with my phone.”</p><p className="mt-4 text-ink-300">— A Solstice Bay guest</p></div>}
    >
      {error && <Alert tone={error.code === 'ACCOUNT_LOCKED' ? 'amber' : 'red'} className="mb-4" title={error.code === 'ACCOUNT_LOCKED' ? 'Account temporarily locked' : 'Sign-in failed'}>{error.message}</Alert>}
      {mfa ? (
        <form onSubmit={submitMfa} className="space-y-4">
          {mfa.simulatedCode && <Alert tone="brass" icon={ShieldCheck} title="Simulated e-mail / SMS">Your one-time code is <b className="font-mono tracking-widest">{mfa.simulatedCode}</b> (shown because messages are simulated in development).</Alert>}
          <Field label="One-time code"><Input autoFocus inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-center font-mono text-xl tracking-[0.5em]" /></Field>
          <Button type="submit" size="lg" className="w-full" loading={pending}>Verify and continue</Button>
        </form>
      ) : (
        <>
          <form onSubmit={submit} className="space-y-4">
            <Field label="E-mail"><Input icon={Mail} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></Field>
            <Field label="Password"><Input icon={Lock} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></Field>
            <div className="flex justify-end text-sm"><Link to="/forgot-password" className="font-medium text-brass-700 hover:underline">Forgot password?</Link></div>
            <Button type="submit" size="lg" className="w-full" loading={pending} icon={ArrowRight}>Sign in</Button>
          </form>
          <p className="mt-5 text-center text-sm text-ink-500">New guest? <Link to="/register" className="font-semibold text-ink-900 hover:underline">Create an account</Link></p>

          <div className="mt-8 rounded-xl border border-ink-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink-800">Demo accounts</span>
              <span className="font-mono text-[11px] text-ink-500">password {DEMO_PASSWORD}</span>
            </div>
            <div className="grid gap-1.5">
              {DEMO.map((d) => (
                <button key={d.email} disabled={pending} onClick={() => { setEmail(d.email); setPassword(DEMO_PASSWORD); submit(null, { email: d.email, password: DEMO_PASSWORD }); }}
                  className="group flex items-center justify-between rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-brass-300 hover:bg-brass-50">
                  <span><span className="block text-[13px] font-semibold text-ink-900">{d.role}</span><span className="block text-[12px] text-ink-500">{d.who}</span></span>
                  <ArrowRight className="size-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brass-600" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </AuthLayout>
  );
}
