/** User.Password.Reset step 2. */
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthLayout } from './AuthLayout.jsx';
import { Alert, Button, Field, Input } from '../../components/ui/index.js';
import { api } from '../../lib/api.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setPending(true);
    try {
      await api.post('/auth/password/reset', { token: params.get('token'), password });
      toast.success('Password updated. Please sign in.');
      navigate('/login');
    } catch (err) { setError(err); } finally { setPending(false); }
  };
  return (
    <AuthLayout title="Choose a new password" subtitle="All your other sessions will be signed out.">
      {error && <Alert tone="red" className="mb-4">{error.message}</Alert>}
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password" hint="At least 8 characters with a letter and a number."><Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button type="submit" size="lg" className="w-full" loading={pending}>Update password</Button>
      </form>
      <p className="mt-6 text-center text-sm"><Link to="/login" className="font-medium text-brass-700 hover:underline">Back to sign in</Link></p>
    </AuthLayout>
  );
}
