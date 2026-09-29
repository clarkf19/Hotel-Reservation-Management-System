/** User.Password.Reset step 1 — a verified e-mail link valid for 30 minutes. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { AuthLayout } from './AuthLayout.jsx';
import { Alert, Button, Field, Input } from '../../components/ui/index.js';
import { api } from '../../lib/api.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setPending(true);
    try { setResult(await api.post('/auth/password/forgot', { email })); } catch (err) { setError(err); } finally { setPending(false); }
  };
  return (
    <AuthLayout title="Reset your password" subtitle="We'll e-mail you a secure link that is valid for 30 minutes.">
      {error && <Alert tone="red" className="mb-4">{error.message}</Alert>}
      {result ? (
        <div className="space-y-4">
          <Alert tone="green" icon={MailCheck} title="Check your inbox">If an account exists for {email}, a reset link is on its way.</Alert>
          {result.simulatedEmailLink && <Alert tone="brass" title="Simulated e-mail (development)">E-mail delivery is simulated locally. <Link className="font-semibold underline" to={result.simulatedEmailLink.replace(/^https?:\/\/[^/]+/, '')}>Open the reset link</Link></Alert>}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-mail"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Button type="submit" size="lg" className="w-full" loading={pending}>Send reset link</Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm"><Link to="/login" className="font-medium text-brass-700 hover:underline">Back to sign in</Link></p>
    </AuthLayout>
  );
}
