/** Guest self-registration (AS-1 valid e-mail; UD-2 guided walkthrough on first sign-in). */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Crown, KeyRound, Sparkles } from 'lucide-react';
import { AuthLayout } from './AuthLayout.jsx';
import { Alert, Button, Field, Input } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const strong = form.password.length >= 8 && /[A-Za-z]/.test(form.password) && /\d/.test(form.password);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await register(form);
      toast.success(`Welcome aboard! Your Guest ID is ${result.user.guestId}.`);
      navigate('/guest', { replace: true, state: { onboarding: true } });
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Book faster, check in from your phone and earn loyalty points on every stay."
      aside={<div className="space-y-4 text-white">{[[Sparkles, 'Smart room recommendations from your preferences'], [KeyRound, 'Digital check-in and phone-as-key'], [Crown, 'Loyalty points credited after every stay']].map(([I, t]) => <div key={t} className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-brass-400/20 text-brass-300"><I className="size-5" /></span><span className="text-lg">{t}</span></div>)}</div>}>
      {error && <Alert tone="red" className="mb-4">{error.message}</Alert>}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name" required><Input required value={form.name} onChange={set('name')} autoComplete="name" /></Field>
        <Field label="E-mail" required hint="We send booking confirmations and invoices here."><Input type="email" required value={form.email} onChange={set('email')} autoComplete="email" /></Field>
        <Field label="Mobile (optional)" hint="For SMS check-in reminders."><Input value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" autoComplete="tel" /></Field>
        <Field label="Password" required hint="At least 8 characters with a letter and a number." error={form.password && !strong ? 'Not strong enough yet' : null}><Input type="password" required value={form.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <Button type="submit" size="lg" className="w-full" loading={pending} disabled={!strong}>Create account</Button>
      </form>
      <p className="mt-5 text-center text-sm text-ink-500">Already have an account? <Link to="/login" className="font-semibold text-ink-900 hover:underline">Sign in</Link></p>
    </AuthLayout>
  );
}
