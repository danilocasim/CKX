import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      const token = localStorage.getItem('accessToken');
      if (token) {
        window.location.href = `/auth/set-cookie?token=${encodeURIComponent(
          token
        )}&redirect=${encodeURIComponent(redirect)}`;
      } else {
        navigate(redirect);
      }
    } catch (err) {
      setError(err.message || 'Login failed.');
      setLoading(false);
    }
  }

  return (
    <div className='min-h-screen pt-24 pb-12 px-4'>
      <div className='max-w-md mx-auto'>
        <div className='bg-bg-card border border-zinc-800 rounded-xl shadow-xl p-6'>
          <h2 className='text-xl font-semibold mb-4'>Welcome back</h2>
          {error && (
            <div
              className='mb-4 p-3 rounded-lg bg-red-500/20 text-red-300 text-sm'
              role='alert'
            >
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className='mb-4'>
              <label
                htmlFor='email'
                className='block text-sm font-medium text-zinc-300 mb-1'
              >
                Email
              </label>
              <input
                id='email'
                type='email'
                autoComplete='email'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className='w-full px-3 py-2 rounded-lg bg-bg-surface border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary'
                required
              />
            </div>
            <div className='mb-4'>
              <label
                htmlFor='password'
                className='block text-sm font-medium text-zinc-300 mb-1'
              >
                Password
              </label>
              <input
                id='password'
                type='password'
                autoComplete='current-password'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className='w-full px-3 py-2 rounded-lg bg-bg-surface border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary'
                required
              />
            </div>
            <button
              type='submit'
              disabled={loading}
              className='w-full py-2.5 rounded-lg bg-primary hover:bg-primary-dark text-white font-medium disabled:opacity-50'
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <p className='text-zinc-500 text-sm mt-4'>
            Don't have an account?{' '}
            <Link to='/register' className='text-primary-light hover:underline'>
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
