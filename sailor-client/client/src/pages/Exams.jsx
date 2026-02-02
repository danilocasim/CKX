import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { examApi, sessionApi } from '../services/api';
import Layout from '../components/Layout';

const categoryIcons = {
  ckad: '💻',
  cka: '🖧',
  cks: '🛡️',
  helm: '⎈',
  docker: '🐳',
  other: '☸️',
};

const categoryColors = {
  ckad: 'bg-blue-500/20 border-blue-500/50',
  cka: 'bg-green-500/20 border-green-500/50',
  cks: 'bg-purple-500/20 border-purple-500/50',
  helm: 'bg-cyan-500/20 border-cyan-500/50',
  docker: 'bg-sky-500/20 border-sky-500/50',
  other: 'bg-gray-500/20 border-gray-500/50',
};

export default function Exams() {
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(null);
  const [error, setError] = useState(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [clearingAll, setClearingAll] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchLabs();
    fetchSessionCount();
  }, []);

  const fetchLabs = async () => {
    try {
      const response = await examApi.listLabs();
      setLabs(response.data.labs || response.data.data?.labs || []);
    } catch (err) {
      console.error('Failed to fetch labs:', err);
      setError('Failed to load exams. Make sure CKX is running.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSessionCount = async () => {
    try {
      const response = await sessionApi.listSessions();
      const count = response.data.data?.count || response.data.count || 0;
      setSessionCount(count);
    } catch (err) {
      console.error('Failed to fetch session count:', err);
    }
  };

  const clearAllSessions = async () => {
    if (!confirm(`Are you sure you want to clear all ${sessionCount} session(s)?`)) {
      return;
    }
    setClearingAll(true);
    setError(null);
    try {
      await sessionApi.clearAllSessions();
      setSessionCount(0);
      setError(null);
    } catch (err) {
      console.error('Failed to clear sessions:', err);
      setError('Failed to clear sessions. Please try again.');
    } finally {
      setClearingAll(false);
      fetchSessionCount();
    }
  };

  const startExam = async (labId) => {
    setStarting(labId);
    setError(null);
    try {
      const response = await examApi.createExam(labId);
      // API returns { id: examId } or nested { data: { id: examId } }
      const examId = response.data.id || response.data.data?.id || response.data.examId || response.data.data?.examId;
      
      if (!examId) {
        throw new Error('No exam ID returned from server');
      }
      
      // Open exam in new tab
      window.open(`http://localhost:30080/exam.html?id=${examId}`, '_blank');
      setStarting(null);
    } catch (err) {
      console.error('Failed to start exam:', err);
      setError(err.response?.data?.message || err.message || 'Failed to start exam. Please try again.');
      setStarting(null);
    }
  };

  const groupedLabs = labs.reduce((acc, lab) => {
    const category = lab.category?.toLowerCase() || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(lab);
    return acc;
  }, {});

  if (loading) {
    return (
      <Layout>
        <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Practice Exams</h1>
            <p className="text-gray-400 mt-1">Choose an exam to start practicing</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-400 text-sm">
              Active Sessions: <span className={`font-semibold ${sessionCount >= 10 ? 'text-red-400' : 'text-white'}`}>{sessionCount}</span>/10
            </span>
            {sessionCount > 0 && (
              <button
                onClick={clearAllSessions}
                disabled={clearingAll}
                className="btn btn-secondary text-sm px-4 py-2 disabled:opacity-50"
              >
                {clearingAll ? 'Clearing...' : `Clear All (${sessionCount})`}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {Object.keys(groupedLabs).length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-gray-400 mb-4">No exams available</p>
            <p className="text-gray-500 text-sm">Make sure CKX services are running</p>
          </div>
        ) : (
          Object.entries(groupedLabs).map(([category, categoryLabs]) => (
            <div key={category} className="mb-8">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <span>{categoryIcons[category] || '☸️'}</span>
                <span>{category.toUpperCase()}</span>
                <span className="text-gray-500 text-sm font-normal">
                  ({categoryLabs.length} exam{categoryLabs.length !== 1 ? 's' : ''})
                </span>
              </h2>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryLabs.map((lab) => (
                  <div
                    key={lab.id}
                    className={`card border ${categoryColors[category] || categoryColors.other}`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-semibold text-white">{lab.name}</h3>
                        <p className="text-gray-400 text-sm">{lab.id}</p>
                      </div>
                      {lab.type === 'mock' && (
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                          FREE
                        </span>
                      )}
                    </div>

                    <div className="flex gap-4 text-sm text-gray-400 mb-4">
                      <div>
                        <span className="text-gray-500">Questions:</span>{' '}
                        <span className="text-white">{lab.questionCount || '?'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Duration:</span>{' '}
                        <span className="text-white">{lab.duration || 120} min</span>
                      </div>
                    </div>

                    <button
                      onClick={() => startExam(lab.id)}
                      disabled={starting === lab.id}
                      className="w-full btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {starting === lab.id ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="animate-spin">⏳</span>
                          Starting...
                        </span>
                      ) : (
                        'Start Exam'
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </Layout>
  );
}
