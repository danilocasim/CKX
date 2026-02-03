import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

function formatPassType(type) {
  const names = {
    '38_hours': '38 Hours Pass',
    '1_week': '1 Week Pass',
    '2_weeks': '2 Weeks Pass',
  };
  return names[type] || type;
}

function formatDuration(hours) {
  if (hours >= 168) return `${Math.floor(hours / 24)} days`;
  return `${hours} hours`;
}

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const { fetchWithAuth, isAuthenticated } = useAuth();
  const [state, setState] = useState('loading'); // loading | success | error
  const [passType, setPassType] = useState('-');
  const [passDuration, setPassDuration] = useState('-');
  const [errorMessage, setErrorMessage] = useState(
    'Unable to verify your payment.'
  );

  useEffect(() => {
    if (!sessionId) {
      setState('error');
      setErrorMessage('No session ID provided');
      return;
    }
    const token = getCookie('ckx_token') || localStorage.getItem('accessToken');
    if (!token) {
      setState('error');
      setErrorMessage('Please log in to verify your payment');
      return;
    }
    fetchWithAuth(`/facilitator/api/v1/billing/verify/${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.data) {
          setState('error');
          setErrorMessage(data.message || 'Verification failed');
          return;
        }
        setPassType(formatPassType(data.data.passType));
        setPassDuration(formatDuration(data.data.durationHours));
        setState('success');
      })
      .catch(() => {
        setState('error');
        setErrorMessage('Network error. Please try again.');
      });
  }, [sessionId, fetchWithAuth]);

  return (
    <div className='min-h-screen flex items-center justify-center px-4 py-12'>
      <div className='bg-bg-card border border-zinc-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center'>
        {state === 'loading' && (
          <>
            <div className='animate-spin rounded-full h-12 w-12 border-2 border-primary border-t-transparent mx-auto mb-4' />
            <h4 className='font-semibold mb-2'>Verifying payment...</h4>
            <p className='text-zinc-500 text-sm'>
              Please wait while we confirm your purchase.
            </p>
          </>
        )}
        {state === 'success' && (
          <>
            <div className='w-20 h-20 rounded-full bg-accent-green flex items-center justify-center mx-auto mb-4'>
              <i className='fas fa-check text-3xl text-white' />
            </div>
            <h2 className='text-xl font-bold mb-2'>Payment Successful!</h2>
            <p className='text-zinc-500 text-sm mb-4'>
              Your access pass has been purchased successfully.
            </p>
            <div className='bg-bg-surface rounded-lg p-4 mb-4 text-left'>
              <div className='grid grid-cols-2 gap-2 text-sm'>
                <div>
                  <small className='text-zinc-500'>Pass Type</small>
                  <p className='font-medium'>{passType}</p>
                </div>
                <div>
                  <small className='text-zinc-500'>Duration</small>
                  <p className='font-medium'>{passDuration}</p>
                </div>
              </div>
            </div>
            <div className='bg-accent-blue/10 border border-accent-blue/30 rounded-lg p-3 text-left text-sm text-zinc-300 mb-4'>
              <strong>Note:</strong> Your timer will start when you begin your
              first full exam.
            </div>
            <div className='flex flex-col gap-2'>
              <Link
                to='/'
                className='inline-block py-3 rounded-lg bg-primary hover:bg-primary-dark text-white font-medium'
              >
                Start Practicing
              </Link>
              <Link
                to='/pricing'
                className='inline-block py-2 text-zinc-400 hover:text-white text-sm'
              >
                View My Passes
              </Link>
            </div>
          </>
        )}
        {state === 'error' && (
          <>
            <div className='text-red-500 mb-4'>
              <i className='fas fa-exclamation-circle text-5xl' />
            </div>
            <h4 className='font-semibold mb-2'>Verification Failed</h4>
            <p className='text-zinc-500 text-sm mb-4'>{errorMessage}</p>
            <div className='flex flex-col gap-2'>
              <Link
                to='/pricing'
                className='inline-block py-3 rounded-lg bg-primary hover:bg-primary-dark text-white font-medium'
              >
                Return to Pricing
              </Link>
              <a
                href='mailto:support@ck-x.io'
                className='inline-block py-2 text-zinc-400 hover:text-white text-sm'
              >
                Contact Support
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
