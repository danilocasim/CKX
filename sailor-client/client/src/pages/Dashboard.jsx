import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userApi } from '../services/api';
import Layout from '../components/Layout';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentExams, setRecentExams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [statsRes, examsRes] = await Promise.all([
        userApi.getStats(),
        userApi.getExamHistory({ limit: 5 }),
      ]);

      setStats(statsRes.data.data);
      setRecentExams(examsRes.data.data.exams || []);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const calculatePercentage = (score, maxScore) => {
    if (!score || !maxScore) return null;
    return Math.round((score / maxScore) * 100);
  };

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
        {/* Welcome Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">
            Welcome back, {user?.displayName || user?.email?.split('@')[0]}!
          </h1>
          <p className="text-gray-400 mt-1">Track your progress and continue practicing</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Attempts</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {stats?.totalAttempts || 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-primary-500/20 rounded-full flex items-center justify-center">
                <span className="text-2xl">📝</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Completed</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {stats?.completed || 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                <span className="text-2xl">✅</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Average Score</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {stats?.averageScore ? `${stats.averageScore}%` : 'N/A'}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                <span className="text-2xl">📊</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Quick Actions */}
          <div className="lg:col-span-1">
            <div className="card">
              <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
              <div className="space-y-3">
                <Link to="/exams" className="w-full btn btn-primary text-center flex items-center justify-center gap-3">
                  <span>🎯</span>
                  <span>Start Practice Exam</span>
                </Link>
                <Link to="/exams" className="w-full btn btn-secondary text-left flex items-center gap-3">
                  <span>📚</span>
                  <span>Browse All Exams</span>
                </Link>
                <button className="w-full btn btn-secondary text-left flex items-center gap-3">
                  <span>⚙️</span>
                  <span>Account Settings</span>
                </button>
              </div>
            </div>

            {/* Best Score */}
            {stats?.bestScore && (
              <div className="card mt-6">
                <h2 className="text-lg font-semibold text-white mb-4">Best Score</h2>
                <div className="text-center">
                  <p className={`text-4xl font-bold ${stats.bestScore >= 66 ? 'text-green-400' : 'text-yellow-400'}`}>
                    {stats.bestScore}%
                  </p>
                  <p className="text-gray-400 text-sm mt-2">
                    {stats.bestScore >= 66 ? 'Passing score!' : 'Keep practicing!'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Recent Exam Attempts */}
          <div className="lg:col-span-2">
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white">Recent Attempts</h2>
                {recentExams.length > 0 && (
                  <button className="text-primary-500 text-sm hover:text-primary-400">
                    View All
                  </button>
                )}
              </div>

              {recentExams.length > 0 ? (
                <div className="space-y-4">
                  {recentExams.map((exam) => {
                    const percentage = calculatePercentage(exam.score, exam.maxScore);
                    return (
                      <div
                        key={exam.id}
                        className="flex items-center justify-between p-4 bg-sailor-dark rounded-lg border border-gray-700/50"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-primary-500/20 rounded-lg flex items-center justify-center">
                            <span className="text-lg">
                              {exam.category?.toLowerCase() === 'ckad' ? '💻' :
                               exam.category?.toLowerCase() === 'cka' ? '🖧' :
                               exam.category?.toLowerCase() === 'cks' ? '🛡️' : '☸️'}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-white">{exam.labId || exam.category}</p>
                            <p className="text-sm text-gray-400">{formatDate(exam.startedAt)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {exam.status === 'completed' && percentage !== null ? (
                            <>
                              <p className={`font-semibold ${percentage >= 66 ? 'text-green-400' : 'text-red-400'}`}>
                                {percentage}%
                              </p>
                              <p className="text-sm text-gray-400">
                                {exam.score}/{exam.maxScore}
                              </p>
                            </>
                          ) : (
                            <span className="text-yellow-400 text-sm">In Progress</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">📋</div>
                  <p className="text-gray-400 mb-4">No exam attempts yet</p>
                  <Link to="/exams" className="btn btn-primary">
                    Start Your First Exam
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
