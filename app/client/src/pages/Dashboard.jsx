import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { fetchWithAuth, getUser, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('—');
  const [accessStatus, setAccessStatus] = useState('—');
  const [examsCount, setExamsCount] = useState('—');
  const [examHistory, setExamHistory] = useState([]);
  const [noExams, setNoExams] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      window.location.href = '/login?redirect=/dashboard';
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const user = await getUser();
        if (!cancelled && user)
          setUserName(user.displayName || user.email || 'User');

        const statusRes = await fetchWithAuth(
          '/sailor-client/api/v1/access/status'
        );
        if (!cancelled && statusRes.ok) {
          const statusData = await statusRes.json();
          const d = statusData.data || statusData;
          if (d.hasAccess || d.hasValidPass) {
            const remain =
              d.remainingHuman ??
              (d.hoursRemaining != null ? d.hoursRemaining + ' hours' : null) ??
              d.remainingSeconds;
            setAccessStatus(
              (d.passType || 'Active pass') +
                (remain ? ' · ' + remain + ' remaining' : '')
            );
          } else if (d.hasPendingPass) {
            setAccessStatus('You have a pass not yet activated.');
          } else {
            setAccessStatus('No active pass. Mock exams are free.');
          }
        } else if (!cancelled) {
          setAccessStatus('No active pass. Mock exams are free.');
        }

        const statsRes = await fetchWithAuth(
          '/sailor-client/api/v1/users/me/stats'
        );
        if (!cancelled && statsRes.ok) {
          const statsData = await statsRes.json();
          const s = statsData.data || statsData;
          setExamsCount((s.examsCompleted ?? s.totalExams ?? 0) + ' completed');
        } else if (!cancelled) {
          setExamsCount('0 completed');
        }

        const examsRes = await fetchWithAuth(
          '/sailor-client/api/v1/users/me/exams'
        );
        if (!cancelled && examsRes.ok) {
          const examsData = await examsRes.json();
          const list = examsData.data ?? examsData.exams ?? [];
          if (Array.isArray(list) && list.length > 0) {
            setExamHistory(list.slice(0, 10));
            setNoExams(false);
          } else {
            setExamHistory([]);
            setNoExams(true);
          }
        } else if (!cancelled) {
          setNoExams(true);
        }
      } catch (_) {
        if (!cancelled) {
          setAccessStatus('Could not load access status.');
          setExamsCount('—');
          setNoExams(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [fetchWithAuth, getUser, isAuthenticated]);

  if (loading) {
    return (
      <div className='pt-24 pb-12 flex flex-col items-center justify-center'>
        <div className='animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent' />
        <p className='mt-2 text-zinc-400'>Loading...</p>
      </div>
    );
  }

  return (
    <div className='pt-24 pb-12 px-4 max-w-5xl mx-auto'>
      <h1 className='text-2xl font-semibold mb-6'>Welcome back, {userName}</h1>
      <div className='grid md:grid-cols-2 gap-4 mb-8'>
        <div className='bg-bg-card border border-zinc-800 rounded-xl p-5'>
          <h5 className='font-medium mb-2'>Access Pass</h5>
          <p className='text-zinc-400 text-sm mb-3'>{accessStatus}</p>
          <Link
            to='/pricing'
            className='inline-block text-sm px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-dark text-white'
          >
            Buy more time
          </Link>
        </div>
        <div className='bg-bg-card border border-zinc-800 rounded-xl p-5'>
          <h5 className='font-medium mb-2'>Exams completed</h5>
          <p className='text-zinc-400 text-sm mb-3'>{examsCount}</p>
          <Link
            to='/'
            className='inline-block text-sm px-3 py-1.5 rounded-lg border border-zinc-600 text-zinc-300 hover:bg-bg-surface'
          >
            Start practice
          </Link>
        </div>
      </div>
      <h2 className='text-lg font-medium mb-3'>Recent exam history</h2>
      <div className='overflow-x-auto rounded-lg border border-zinc-800'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='bg-bg-surface text-left'>
              <th className='px-4 py-3 text-zinc-300'>Lab</th>
              <th className='px-4 py-3 text-zinc-300'>Score</th>
              <th className='px-4 py-3 text-zinc-300'>Date</th>
              <th className='px-4 py-3 text-zinc-300'>Status</th>
            </tr>
          </thead>
          <tbody>
            {examHistory.map((e, i) => {
              const date = e.completedAt ?? e.startedAt ?? e.createdAt;
              const dateStr = date ? new Date(date).toLocaleDateString() : '—';
              const score =
                e.score != null && e.maxScore != null
                  ? Math.round((e.score / e.maxScore) * 100) + '%'
                  : '—';
              return (
                <tr key={e.id || i} className='border-t border-zinc-800'>
                  <td className='px-4 py-3'>{e.labId ?? e.lab_id ?? '—'}</td>
                  <td className='px-4 py-3'>{score}</td>
                  <td className='px-4 py-3'>{dateStr}</td>
                  <td className='px-4 py-3'>{e.status ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {noExams && examHistory.length === 0 && (
        <p className='text-zinc-500 mt-4'>
          No exams yet.{' '}
          <Link to='/' className='text-primary-light hover:underline'>
            Choose an exam
          </Link>
          .
        </p>
      )}
    </div>
  );
}
