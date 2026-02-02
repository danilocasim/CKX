import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';

const plans = [
  {
    id: '38_hours',
    name: '38 Hours Pass',
    description: 'Perfect when your exam is within a day',
    price: '$4.99',
    originalPrice: '$9.99',
    discount: '50%',
    features: ['Full exam access', 'Instant feedback', 'Unlimited retakes'],
  },
  {
    id: '1_week',
    name: '1 Week Pass',
    description: 'Great for focused preparation',
    price: '$19.99',
    originalPrice: '$29.99',
    discount: '33%',
    features: ['Full exam access', 'Instant feedback', 'Unlimited retakes'],
  },
  {
    id: '2_weeks',
    name: '2 Weeks Pass',
    description: 'Ideal when you have time to master the materials',
    price: '$29.99',
    originalPrice: '$49.99',
    discount: '40%',
    popular: true,
    features: ['Full exam access', 'Priority support', 'Unlimited retakes', 'Instant feedback'],
  },
];

const certifications = [
  { name: 'CKAD', exams: 2, icon: '💻' },
  { name: 'CKA', exams: 2, icon: '🖧' },
  { name: 'CKS', exams: 1, icon: '🛡️' },
  { name: 'Helm', exams: 1, icon: '⎈' },
  { name: 'Docker', exams: 1, icon: '🐳' },
];

const faqs = [
  {
    question: 'When does my access pass timer start?',
    answer: 'Your timer starts when you start your first practice exam, not when you purchase the pass. This gives you flexibility to buy now and start when you\'re ready.',
  },
  {
    question: 'What happens after my pass expires?',
    answer: 'You\'ll retain access to view your past exam results and scores. To take new practice exams, you\'ll need to purchase another access pass.',
  },
  {
    question: 'Are the practice environments real Kubernetes clusters?',
    answer: 'Yes! Each practice session runs on a real KIND (Kubernetes in Docker) cluster. You get hands-on experience with actual kubectl commands, pod deployments, and cluster operations.',
  },
  {
    question: 'Can I get a refund?',
    answer: 'We offer full refunds within 24 hours of purchase if you haven\'t started any practice exams. Contact our support team for assistance.',
  },
];

export default function Pricing() {
  const { isAuthenticated } = useAuth();

  const handlePurchase = (planId) => {
    if (!isAuthenticated) {
      window.location.href = '/login?redirect=/pricing';
      return;
    }
    // TODO: Implement checkout
    alert(`Initiating checkout for ${planId}`);
  };

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 via-transparent to-transparent"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Master Kubernetes Certifications
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Practice with real clusters, get instant feedback, and pass your exam with confidence
          </p>

          {/* Stats */}
          <div className="flex justify-center gap-12 mt-12">
            <div>
              <div className="text-3xl font-bold text-white">2,500+</div>
              <div className="text-gray-400">Engineers Practicing</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">94%</div>
              <div className="text-gray-400">Pass Rate</div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left Column: What's Included */}
            <div className="lg:col-span-1 space-y-6">
              {/* Certifications Card */}
              <div className="card">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <span>📦</span> What's Included
                </h3>
                <div className="space-y-4">
                  {certifications.map((cert) => (
                    <div key={cert.name} className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-sailor-dark rounded-lg flex items-center justify-center">
                        <span>{cert.icon}</span>
                      </div>
                      <div>
                        <div className="font-medium text-white">{cert.name}</div>
                        <div className="text-sm text-gray-400">{cert.exams} practice exams</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Features Card */}
              <div className="card">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <span>⭐</span> Why Choose Sailor.sh
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-gray-300">
                    <span className="text-primary-500">✓</span>
                    Realistic Desktop Environment
                  </li>
                  <li className="flex items-center gap-3 text-gray-300">
                    <span className="text-primary-500">✓</span>
                    Unlimited Retakes
                  </li>
                  <li className="flex items-center gap-3 text-gray-300">
                    <span className="text-primary-500">✓</span>
                    Actual K8s Clusters
                  </li>
                  <li className="flex items-center gap-3 text-gray-300">
                    <span className="text-primary-500">✓</span>
                    Instant Feedback
                  </li>
                  <li className="flex items-center gap-3 text-gray-300">
                    <span className="text-primary-500">✓</span>
                    Active Community Support
                  </li>
                </ul>
              </div>
            </div>

            {/* Right Column: Pricing Cards */}
            <div className="lg:col-span-2 space-y-6">
              {/* Free Trial */}
              <div className="card bg-gradient-to-r from-sailor-card to-sailor-dark border-primary-500/30">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="bg-primary-500/20 text-primary-500 px-3 py-1 rounded-full text-sm font-medium">
                        ⚡ Free Trial
                      </span>
                      <span className="text-gray-400 text-sm">No card required</span>
                    </div>
                    <p className="text-gray-300">Try a sample mock exam and see if it's the right fit for you</p>
                  </div>
                  <Link to="/?mock=true" className="btn btn-outline whitespace-nowrap">
                    Try Free
                  </Link>
                </div>
              </div>

              {/* Pricing Plans */}
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className={`card relative ${plan.popular ? 'border-primary-500 ring-1 ring-primary-500' : ''}`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 right-6 bg-primary-500 text-white px-4 py-1 rounded-full text-sm font-medium">
                      👑 Best Value
                    </div>
                  )}
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-white mb-1">{plan.name}</h3>
                      <p className="text-gray-400 mb-4">{plan.description}</p>
                      <div className="flex flex-wrap gap-2">
                        {plan.features.map((feature) => (
                          <span
                            key={feature}
                            className="bg-sailor-dark text-gray-300 px-3 py-1 rounded-full text-sm"
                          >
                            ✓ {feature}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="flex items-baseline gap-2">
                          <span className="text-3xl font-bold text-white">{plan.price}</span>
                          <span className="text-gray-500 line-through">{plan.originalPrice}</span>
                        </div>
                        <span className="text-green-400 text-sm">Save {plan.discount}</span>
                      </div>
                      <button
                        onClick={() => handlePurchase(plan.id)}
                        className={`btn ${plan.popular ? 'btn-primary' : 'btn-secondary'} whitespace-nowrap`}
                      >
                        Buy Now
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-sailor-dark/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-white text-center mb-8">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <details key={index} className="card group">
                <summary className="flex items-center justify-between cursor-pointer list-none">
                  <span className="font-medium text-white">{faq.question}</span>
                  <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="text-gray-400 mt-4">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-gray-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-400 text-sm">
            Sailor.sh is not affiliated with CNCF, Linux Foundation, or PSI.
          </p>
        </div>
      </footer>
    </Layout>
  );
}
