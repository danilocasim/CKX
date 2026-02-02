import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';

const categoryColors = {
  ckad: 'bg-blue-500/20 border-blue-500/50',
  cka: 'bg-green-500/20 border-green-500/50',
  cks: 'bg-purple-500/20 border-purple-500/50',
};

// Available exam categories
const examCategories = [
  { id: 'ckad', name: 'CKAD', description: 'Certified Kubernetes Application Developer', icon: '💻' },
  { id: 'cka', name: 'CKA', description: 'Certified Kubernetes Administrator', icon: '🖧' },
  { id: 'cks', name: 'CKS', description: 'Certified Kubernetes Security Specialist', icon: '🛡️' },
];

export default function Exams() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, loading, navigate]);

  const startPracticing = () => {
    // Get token from localStorage and pass to CKX
    const token = localStorage.getItem('accessToken');
    if (token) {
      window.open(`http://localhost:30080/?token=${token}`, '_blank');
    } else {
      // Should not happen since page is auth-protected
      navigate('/login');
    }
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

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Practice Kubernetes Exams</h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Get hands-on practice with real exam-like environments. 
            Choose your certification path and start practicing.
          </p>
        </div>

        {/* Exam Categories Display */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {examCategories.map((cat) => (
            <div
              key={cat.id}
              className={`card border ${categoryColors[cat.id]} text-center py-8`}
            >
              <div className="text-4xl mb-4">{cat.icon}</div>
              <h3 className="text-xl font-bold text-white mb-2">{cat.name}</h3>
              <p className="text-gray-400 text-sm">{cat.description}</p>
            </div>
          ))}
        </div>

        {/* Main Action Button */}
        <div className="text-center">
          <button
            onClick={startPracticing}
            className="btn btn-primary text-lg px-12 py-4"
          >
            Start Practicing
          </button>
          
          <p className="text-gray-500 text-sm mt-4">
            Opens the CK-X exam environment in a new tab where you can select and start exams.
          </p>
        </div>
      </div>
    </Layout>
  );
}
