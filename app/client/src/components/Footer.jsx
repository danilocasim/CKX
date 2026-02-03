import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className='border-t border-zinc-800 bg-bg-dark mt-auto'>
      <div className='max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8'>
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <span className='brand-gradient'>DojoExam</span>
            <p className='text-zinc-500 text-sm mt-1'>
              Kubernetes certification practice
            </p>
          </div>
          <div className='flex gap-6'>
            <Link
              to='/pricing'
              className='text-zinc-400 hover:text-white text-sm'
            >
              Pricing
            </Link>
            <Link
              to='/dashboard'
              className='text-zinc-400 hover:text-white text-sm'
            >
              Dashboard
            </Link>
          </div>
        </div>
        <p className='text-zinc-600 text-xs mt-6 text-center sm:text-left'>
          DojoExam is not affiliated with CNCF, Linux Foundation, or PSI.
        </p>
      </div>
    </footer>
  );
}
