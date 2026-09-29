import { Link } from 'react-router-dom';
import { Logo } from '../../components/layout/Logo.jsx';

const IMG = 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1600&q=80';

export function AuthLayout({ title, subtitle, children, aside }) {
  return (
    <div className="grid min-h-full lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link to="/"><Logo /></Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="font-display text-4xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-2 text-ink-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-ink-900 lg:block">
        <img src={IMG} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-transparent" />
        <div className="relative flex h-full flex-col justify-end p-12">{aside}</div>
      </div>
    </div>
  );
}
