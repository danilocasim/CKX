import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter email and password.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await register(email.trim(), password, displayName.trim() || undefined);
      const token = localStorage.getItem('accessToken');
      if (token) {
        window.location.href = `/auth/set-cookie?token=${encodeURIComponent(
          token
        )}&redirect=${encodeURIComponent('/dashboard')}`;
      } else {
        window.location.href = '/dashboard';
      }
    } catch (err) {
      setError(err.message || 'Registration failed.');
      setLoading(false);
    }
  }

  return (
    <div className='min-h-screen pt-24 pb-12 px-4'>
      <div className='max-w-md mx-auto'>
        <div className='bg-bg-card border border-zinc-800 rounded-xl shadow-xl p-6'>
          <h2 className='text-xl font-semibold mb-4'>Create account</h2>
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
                htmlFor='displayName'
                className='block text-sm font-medium text-zinc-300 mb-1'
              >
                Display name (optional)
              </label>
              <input
                id='displayName'
                type='text'
                autoComplete='name'
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className='w-full px-3 py-2 rounded-lg bg-bg-surface border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary'
              />
            </div>
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
                Password (8+ characters)
              </label>
              <input
                id='password'
                type='password'
                autoComplete='new-password'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className='w-full px-3 py-2 rounded-lg bg-bg-surface border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary'
                minLength={8}
                required
              />
            </div>
            <div className='mb-4'>
              <label
                htmlFor='passwordConfirm'
                className='block text-sm font-medium text-zinc-300 mb-1'
              >
                Confirm password
              </label>
              <input
                id='passwordConfirm'
                type='password'
                autoComplete='new-password'
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className='w-full px-3 py-2 rounded-lg bg-bg-surface border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary'
                minLength={8}
                required
              />
            </div>
            <button
              type='submit'
              disabled={loading}
              className='w-full py-2.5 rounded-lg bg-primary hover:bg-primary-dark text-white font-medium disabled:opacity-50'
            >
              {loading ? 'Creating account...' : 'Sign Up'}
            </button>
          </form>
          <p className='text-zinc-500 text-sm mt-4'>
            Already have an account?{' '}
            <Link to='/login' className='text-primary-light hover:underline'>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
