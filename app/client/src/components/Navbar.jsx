import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNavUser } from '../hooks/useNavUser';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { isAuthenticated, logout } = useAuth();
  const user = useNavUser();

  const navLink = (path, label) => (
    <Link
      to={path}
      className={`block py-2 px-3 rounded md:p-0 ${
        location.pathname === path
          ? 'text-white font-medium'
          : 'text-zinc-400 hover:text-white'
      }`}
      onClick={() => setOpen(false)}
    >
      {label}
    </Link>
  );

  return (
    <nav className='fixed top-0 left-0 right-0 z-50 bg-bg-dark/95 backdrop-blur border-b border-zinc-800'>
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
        <div className='flex flex-wrap items-center justify-between h-16 relative'>
          <Link to='/dashboard' className='brand-gradient'>
            DojoExam
          </Link>
          <button
            type='button'
            className='md:hidden p-2 rounded text-zinc-400 hover:text-white'
            onClick={() => setOpen((o) => !o)}
            aria-label='Toggle menu'
          >
            <i className={`fas fa-${open ? 'times' : 'bars'}`} />
          </button>
          <div
            className={`w-full md:w-auto absolute top-full left-0 md:static ${
              open ? 'block' : 'hidden'
            } md:flex md:items-center md:gap-6 bg-bg-card md:bg-transparent border-b border-zinc-800 md:border-0 shadow-lg md:shadow-none mt-0`}
          >
            <div className='flex flex-col md:flex-row md:items-center gap-1 md:gap-6 py-4 px-4 md:py-0 md:px-0'>
              {navLink('/', 'Exams')}
              {navLink('/pricing', 'Pricing')}
              {navLink('/dashboard', 'Dashboard')}
            </div>
            <div className='pb-4 px-4 md:px-0 md:pb-0 md:ml-auto border-t border-zinc-800 md:border-t-0 pt-3 md:pt-0'>
              {isAuthenticated() && user ? (
                <>
                  <Link
                    to='/dashboard'
                    className='text-zinc-300 hover:text-white mr-3'
                    onClick={() => setOpen(false)}
                  >
                    Account
                  </Link>
                  <button
                    type='button'
                    onClick={() => logout()}
                    className='px-4 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-sm font-medium'
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <Link
                  to='/login'
                  className='inline-block px-4 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-sm font-medium'
                  onClick={() => setOpen(false)}
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
