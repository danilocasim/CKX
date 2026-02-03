import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const CATEGORIES = ['CKAD', 'CKA', 'CKS', 'Other'];

export default function Home() {
  const { fetchWithAuth, isAuthenticated } = useAuth();
  const [labs, setLabs] = useState([]);
  const [selectedLab, setSelectedLab] = useState(null);
  const [category, setCategory] = useState('CKAD');
  const [modalOpen, setModalOpen] = useState(false);
  const [pageLoader, setPageLoader] = useState(false);
  const [loaderMessage, setLoaderMessage] = useState('Lab is getting ready...');
  const [loadingOverlay, setLoadingOverlay] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [progressBar, setProgressBar] = useState(0);
  const [examInfo, setExamInfo] = useState('');
  const [accessBanner, setAccessBanner] = useState({
    show: false,
    text: '',
    status: 'mock',
  });
  const [viewResultsExam, setViewResultsExam] = useState(null);
  const [activeExamWarning, setActiveExamWarning] = useState(null);
  const [terminating, setTerminating] = useState(false);

  const apiFetch = useCallback(
    (url, opts) =>
      isAuthenticated() ? fetchWithAuth(url, opts) : fetch(url, opts),
    [isAuthenticated, fetchWithAuth]
  );

  const filteredLabs = labs.filter((l) => l.category === category);

  useEffect(() => {
    if (!isAuthenticated()) return;
    apiFetch('/facilitator/api/v1/access/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.data) return;
        const d = data.data;
        setAccessBanner((prev) => ({ ...prev, show: true }));
        if (d.hasValidPass || d.hasAccess) {
          const remain =
            d.remainingHuman ??
            (d.hoursRemaining != null ? d.hoursRemaining + 'h' : '');
          setAccessBanner({
            show: true,
            status: 'full',
            text:
              'Full access enabled' +
              (remain ? ' · ' + remain + ' remaining' : ''),
          });
        } else if (d.hasPendingPass) {
          setAccessBanner({
            show: true,
            status: 'mock',
            text: 'You have a pass not yet activated. Mock exams available.',
          });
        } else {
          setAccessBanner({
            show: true,
            status: 'mock',
            text: 'Mock exams only. Get an access pass for full exams.',
          });
        }
      })
      .catch(() => {
        setAccessBanner({
          show: true,
          status: 'mock',
          text: 'Mock exams available. Sign in and get an access pass for full exams.',
        });
      });
  }, [isAuthenticated, apiFetch]);

  useEffect(() => {
    apiFetch('/facilitator/api/v1/exams/current')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.id) {
          localStorage.setItem('currentExamData', JSON.stringify(data));
          if (data.status === 'EVALUATING' || data.status === 'EVALUATED') {
            setViewResultsExam(data);
          }
          if (data.status === 'PREPARING') {
            setLoadingOverlay(true);
            setLoadingMessage('Preparing lab environment...');
            setExamInfo(data.info?.name || 'Unknown Exam');
            pollExamStatus(data.id).then((statusData) => {
              if (statusData?.status === 'READY') {
                window.location.href = `/exam?id=${data.id}`;
              }
            });
          }
        }
      })
      .catch(() => {});
  }, [apiFetch]);

  function pollExamStatus(examId) {
    const startTime = Date.now();
    return new Promise((resolve) => {
      const poll = async () => {
        try {
          const response = await apiFetch(
            `/facilitator/api/v1/exams/${examId}/status`
          );
          const data = await response.json();
          const warmUp = data.warmUpTimeInSeconds ?? 30;
          if (data.status === 'READY') {
            setProgressBar(100);
            setLoadingMessage('Lab environment is ready! Redirecting...');
            setTimeout(() => resolve(data), 1000);
            return;
          }
          const elapsed = (Date.now() - startTime) / 1000;
          setProgressBar(Math.min((elapsed / warmUp) * 100, 95));
          setLoadingMessage(data.message || 'Preparing lab environment...');
          setTimeout(poll, 1000);
        } catch {
          setLoadingMessage('Error. Retrying...');
          setTimeout(poll, 1000);
        }
      };
      poll();
    });
  }

  function fetchLabs(showModalAfter = false) {
    setPageLoader(true);
    setLoaderMessage('Loading labs...');
    apiFetch('/facilitator/api/v1/exams/labs')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch labs');
        return r.json();
      })
      .then((data) => {
        const list = data.labs ?? data;
        const arr = Array.isArray(list) ? list : [];
        setLabs(arr);
        setPageLoader(false);
        if (showModalAfter) setModalOpen(true);
        if (arr.length) {
          const nextCategory = arr.some((l) => l.category === 'CKAD')
            ? 'CKAD'
            : arr[0]?.category || 'CKAD';
          setCategory(nextCategory);
          const firstInCategory =
            arr.find((l) => l.category === nextCategory) ?? arr[0];
          setSelectedLab(firstInCategory);
        }
      })
      .catch(() => {
        setPageLoader(false);
        alert('Failed to load labs. Please try again later.');
      });
  }

  useEffect(() => {
    fetchLabs(false);
  }, []);

  useEffect(() => {
    if (filteredLabs.length && !selectedLab) setSelectedLab(filteredLabs[0]);
    else if (
      filteredLabs.length &&
      selectedLab &&
      !filteredLabs.find((l) => l.id === selectedLab.id)
    ) {
      setSelectedLab(filteredLabs[0]);
    }
  }, [category, filteredLabs]);

  function handleChooseExam() {
    apiFetch('/facilitator/api/v1/exams/current')
      .then((r) => {
        if (r.status === 404) {
          if (labs.length) setModalOpen(true);
          else fetchLabs(true);
          return null;
        }
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data?.id) setActiveExamWarning(data);
      })
      .catch(() => {
        if (labs.length) setModalOpen(true);
        else fetchLabs(true);
      });
  }

  function handleContinueSession() {
    if (activeExamWarning?.id)
      window.location.href = `/exam?id=${activeExamWarning.id}`;
    setActiveExamWarning(null);
  }

  function handleTerminateAndProceed() {
    if (!activeExamWarning?.id) return;
    setTerminating(true);
    setLoadingOverlay(true);
    setLoadingMessage('Terminating active session...');
    apiFetch(`/facilitator/api/v1/exams/${activeExamWarning.id}/terminate`, {
      method: 'POST',
    })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to terminate');
        return r.json();
      })
      .then(() => {
        setActiveExamWarning(null);
        setLoadingOverlay(false);
        localStorage.removeItem('currentExamData');
        localStorage.removeItem('currentExamId');
        if (labs.length) setModalOpen(true);
        else fetchLabs(true);
      })
      .catch(() => {
        setLoadingOverlay(false);
        setTerminating(false);
        alert('Failed to terminate the active exam. Please try again later.');
      });
  }

  function handleStartSelectedExam() {
    if (!selectedLab) return;
    setModalOpen(false);
    setLoadingOverlay(true);
    setLoadingMessage('Starting lab environment...');
    setExamInfo(
      `Lab: ${selectedLab.name} | Difficulty: ${
        selectedLab.difficulty || 'Medium'
      }`
    );
    const payload = { ...selectedLab, labId: selectedLab.id };
    apiFetch('/facilitator/api/v1/exams/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok)
          throw new Error(data.message || data.error || 'Failed to start lab');
        return data;
      })
      .then((data) => {
        if (!data.id) throw new Error('Invalid response: no exam id');
        localStorage.setItem('currentExamId', data.id);
        const warmUp = data.warmUpTimeInSeconds ?? 30;
        setLoadingMessage(
          `Preparing your lab environment (${warmUp}s estimated)`
        );
        return pollExamStatus(data.id);
      })
      .then(() => {
        const examId = localStorage.getItem('currentExamId');
        window.location.href = `/exam?id=${examId}`;
      })
      .catch((err) => {
        setLoadingOverlay(false);
        alert(
          err.message || 'Failed to start the lab. Please try again later.'
        );
      });
  }

  return (
    <>
      {/* Page loader */}
      {pageLoader && (
        <div className='fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-bg-dark/90 backdrop-blur'>
          <div className='animate-spin rounded-full h-12 w-12 border-2 border-white border-t-transparent' />
          <p className='mt-3 text-white'>{loaderMessage}</p>
        </div>
      )}

      {/* Hero */}
      <section className='pt-28 pb-16 px-4 bg-gradient-to-b from-bg-card to-bg-dark'>
        <div className='max-w-4xl mx-auto text-center'>
          <h1 className='text-3xl md:text-4xl font-bold mb-3'>
            Kubernetes Certification Practice
          </h1>
          <p className='text-zinc-400 mb-4'>
            Practice in a realistic environment. Choose a mock exam to start
            free, or unlock full exams with an access pass.
          </p>
          {accessBanner.show && (
            <div
              className={`inline-block mt-3 px-4 py-2 rounded-lg text-sm ${
                accessBanner.status === 'full'
                  ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                  : 'bg-accent-green/15 text-accent-green border border-accent-green/30'
              }`}
            >
              {accessBanner.text}
            </div>
          )}
          <button
            type='button'
            onClick={handleChooseExam}
            className='mt-6 px-8 py-3 rounded-lg bg-white text-primary font-bold hover:bg-zinc-100 transition shadow-lg'
          >
            Choose Exam
          </button>
        </div>
      </section>

      {/* Categories */}
      <main className='py-12 px-4'>
        <div className='max-w-6xl mx-auto'>
          <h2 className='text-xl font-semibold text-center mb-2'>
            Exam Categories
          </h2>
          <p className='text-center text-zinc-500 mb-8'>
            Mock exams are free. Full exams require an access pass.
          </p>
          <div className='grid md:grid-cols-3 gap-6'>
            {['CKAD', 'CKA', 'CKS'].map((cat) => (
              <div
                key={cat}
                className='bg-bg-card border border-zinc-800 rounded-xl p-6 h-full'
              >
                <h3 className='font-semibold flex items-center gap-2'>
                  <i
                    className={`fas fa-${
                      cat === 'CKAD'
                        ? 'code'
                        : cat === 'CKA'
                        ? 'server'
                        : 'shield-alt'
                    }`}
                  />
                  {cat}
                </h3>
                <p className='text-zinc-500 text-sm mt-1'>
                  {cat === 'CKAD' &&
                    'Certified Kubernetes Application Developer'}
                  {cat === 'CKA' && 'Certified Kubernetes Administrator'}
                  {cat === 'CKS' && 'Certified Kubernetes Security Specialist'}
                </p>
                <span className='inline-block mt-2 mr-2 px-2 py-0.5 rounded text-xs bg-accent-green/20 text-accent-green'>
                  Free Mock
                </span>
                <span className='inline-block px-2 py-0.5 rounded text-xs bg-accent-blue/20 text-accent-blue'>
                  Full Exams
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* View Result link (only when current exam is EVALUATING/EVALUATED) */}
      {viewResultsExam && (
        <div className='fixed top-20 right-4 z-40'>
          <a
            href={`/results?id=${viewResultsExam.id}`}
            className='inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-bg-card border border-zinc-700 text-sm hover:bg-bg-surface'
          >
            <i className='fas fa-clipboard-check' /> View Result
          </a>
        </div>
      )}

      {/* Loading overlay */}
      {loadingOverlay && (
        <div className='fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-bg-dark/95 backdrop-blur'>
          <h2 className='text-xl font-semibold mb-4'>
            Preparing Your Lab Environment
          </h2>
          <div className='w-64 h-2 bg-zinc-700 rounded-full overflow-hidden mb-2'>
            <div
              className='h-full bg-primary transition-all duration-300'
              style={{ width: `${progressBar}%` }}
            />
          </div>
          <p className='text-zinc-400 mb-1'>{loadingMessage}</p>
          <p className='text-zinc-500 text-sm'>{examInfo}</p>
          <p className='text-zinc-600 text-xs mt-4'>
            Setup may take a few minutes. You will be redirected when ready.
          </p>
        </div>
      )}

      {/* Exam selection modal */}
      {modalOpen && (
        <div
          className='fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70'
          onClick={() => setModalOpen(false)}
        >
          <div
            className='bg-bg-card border border-zinc-700 rounded-xl shadow-xl max-w-lg w-full p-6'
            onClick={(e) => e.stopPropagation()}
          >
            <h5 className='text-lg font-semibold mb-4'>Select Your Exam</h5>
            <div className='space-y-4'>
              <div>
                <label className='block text-sm text-zinc-400 mb-1'>
                  Certification Type
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className='w-full px-3 py-2 rounded-lg bg-bg-surface border border-zinc-700 text-white'
                >
                  <option value=''>Select type</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className='block text-sm text-zinc-400 mb-1'>Exam</label>
                <select
                  value={selectedLab?.id ?? ''}
                  onChange={(e) =>
                    setSelectedLab(
                      filteredLabs.find((l) => l.id === e.target.value) ?? null
                    )
                  }
                  className='w-full px-3 py-2 rounded-lg bg-bg-surface border border-zinc-700 text-white'
                >
                  <option value=''>Select an exam</option>
                  {filteredLabs.map((lab) => (
                    <option key={lab.id} value={lab.id}>
                      {lab.name}
                    </option>
                  ))}
                </select>
              </div>
              {selectedLab && (
                <div className='p-3 rounded-lg bg-bg-surface border border-zinc-700 text-sm'>
                  <div className='mb-2'>
                    {selectedLab.type === 'mock' || selectedLab.isFree ? (
                      <span className='inline-block px-2 py-0.5 rounded text-xs bg-accent-green/20 text-accent-green'>
                        Free Mock Exam
                      </span>
                    ) : (
                      <span className='inline-block px-2 py-0.5 rounded text-xs bg-accent-blue/20 text-accent-blue'>
                        Full Exam (Paid)
                      </span>
                    )}
                  </div>
                  <p className='text-zinc-300'>
                    {selectedLab.description || 'No description available.'}
                  </p>
                  <div className='mt-2 pt-2 border-t border-zinc-700 flex gap-4 text-zinc-500'>
                    <span>
                      Difficulty: {selectedLab.difficulty || 'Medium'}
                    </span>
                    <span>
                      Time:{' '}
                      {selectedLab.duration ||
                        selectedLab.examDurationInMinutes ||
                        selectedLab.estimatedTime ||
                        '30'}{' '}
                      min
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className='mt-6 flex flex-col gap-2'>
              <button
                type='button'
                onClick={() => setModalOpen(false)}
                className='py-2 rounded-lg border border-zinc-600 text-zinc-300 hover:bg-bg-surface'
              >
                Cancel
              </button>
              <button
                type='button'
                onClick={handleStartSelectedExam}
                disabled={!selectedLab}
                className='py-2 rounded-lg bg-primary hover:bg-primary-dark text-white font-medium disabled:opacity-50'
              >
                Start Exam
              </button>
              <p className='text-zinc-500 text-xs text-center mt-2'>
                By starting an exam you agree to our{' '}
                <a
                  href='/docs/PRIVACY_POLICY.md'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-zinc-400 hover:underline'
                >
                  Privacy Policy
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Active exam warning modal */}
      {activeExamWarning && (
        <div className='fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70'>
          <div className='bg-bg-card border border-zinc-700 rounded-xl shadow-xl max-w-md w-full p-6'>
            <h5 className='text-lg font-semibold mb-3'>Active Exam Detected</h5>
            <p className='text-zinc-400 text-sm mb-4'>
              You already have an active exam session:{' '}
              <strong>{activeExamWarning.info?.name || 'Unknown Exam'}</strong>.
              Only one active exam session can be present at a time.
            </p>
            <div className='flex gap-2'>
              <button
                type='button'
                onClick={handleContinueSession}
                className='flex-1 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white font-medium'
              >
                Continue current session
              </button>
              <button
                type='button'
                onClick={handleTerminateAndProceed}
                disabled={terminating}
                className='flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50'
              >
                {terminating ? 'Terminating...' : 'Terminate and proceed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
