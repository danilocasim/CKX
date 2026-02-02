import { Link } from 'react-router-dom';
import Layout from '../components/Layout';

const features = [
  {
    icon: '🖥️',
    title: 'Realistic Environment',
    description: 'Practice in an environment identical to the real exam with a full desktop experience.',
  },
  {
    icon: '🔄',
    title: 'Unlimited Retakes',
    description: 'Take as many practice exams as you need until you feel confident.',
  },
  {
    icon: '☸️',
    title: 'Real Kubernetes Clusters',
    description: 'Practice on actual KIND clusters, not simulations.',
  },
  {
    icon: '⚡',
    title: 'Instant Feedback',
    description: 'Get your score immediately after completing each exam.',
  },
];

const certifications = [
  { name: 'CKAD', icon: '💻', exams: 2, color: 'bg-blue-500' },
  { name: 'CKA', icon: '🖧', exams: 2, color: 'bg-green-500' },
  { name: 'CKS', icon: '🛡️', exams: 1, color: 'bg-purple-500' },
  { name: 'Helm', icon: '⎈', exams: 1, color: 'bg-cyan-500' },
  { name: 'Docker', icon: '🐳', exams: 1, color: 'bg-sky-500' },
];

export default function Home() {
  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative py-20 lg:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 via-transparent to-transparent"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
              Master Your{' '}
              <span className="text-primary-500">Kubernetes</span>{' '}
              Certification
            </h1>
            <p className="text-xl text-gray-400 mb-8">
              Practice with real clusters, get instant feedback, and pass your CKAD, CKA, or CKS exam with confidence.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/register" className="btn btn-primary text-lg">
                Start Practicing Free
              </Link>
              <Link to="/pricing" className="btn btn-outline text-lg">
                View Pricing
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-white">2,500+</div>
              <div className="text-gray-400">Engineers Practicing</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-white">94%</div>
              <div className="text-gray-400">Pass Rate</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-white">7</div>
              <div className="text-gray-400">Practice Exams</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-white">5</div>
              <div className="text-gray-400">Certifications</div>
            </div>
          </div>
        </div>
      </section>

      {/* Certifications Section */}
      <section className="py-20 bg-sailor-dark/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">Supported Certifications</h2>
            <p className="text-gray-400">Prepare for any Kubernetes certification with our comprehensive practice exams</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {certifications.map((cert) => (
              <div key={cert.name} className="card hover:border-primary-500/50 transition-colors cursor-pointer">
                <div className="text-center">
                  <div className="text-4xl mb-3">{cert.icon}</div>
                  <div className="font-semibold text-white mb-1">{cert.name}</div>
                  <div className="text-sm text-gray-400">{cert.exams} practice exams</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">Why Choose Sailor.sh</h2>
            <p className="text-gray-400">Everything you need to ace your Kubernetes certification</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="card">
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-400 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-primary-600 to-primary-500">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Start Your Journey?
          </h2>
          <p className="text-white/80 mb-8">
            Join thousands of engineers who have passed their Kubernetes certifications with Sailor.sh
          </p>
          <Link to="/register" className="btn bg-white text-primary-600 hover:bg-gray-100">
            Get Started for Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-gray-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-gray-400 text-sm">
              Sailor.sh is not affiliated with CNCF, Linux Foundation, or PSI.
            </div>
            <div className="flex gap-6">
              <a href="https://github.com/nishanb/ck-x" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                GitHub
              </a>
              <a href="https://discord.gg/6FPQMXNgG9" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                Discord
              </a>
            </div>
          </div>
        </div>
      </footer>
    </Layout>
  );
}
