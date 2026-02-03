import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Duration hours must match backend pass_types (migrations/002_access_passes.sql)
const PASSES = [
  {
    name: '38 Hours Access Pass',
    desc: 'Perfect when your exam is within a day',
    durationHours: 38,
    accessTimeLabel: '38 hours full access',
    price: '$4.99',
    original: '$9.99',
    discount: 'Save 50%',
    passTypeId: '38_hours',
  },
  {
    name: '1 Week Access Pass',
    desc: 'Great for focused preparation',
    durationHours: 168,
    accessTimeLabel: '1 week (168 hours) full access',
    price: '$19.99',
    original: '$29.99',
    discount: 'Save 33%',
    passTypeId: '1_week',
  },
  {
    name: '2 Weeks Access Pass',
    desc: 'Ideal when you have a week to master the materials',
    durationHours: 336,
    accessTimeLabel: '2 weeks (336 hours) full access',
    price: '$29.99',
    original: '$49.99',
    discount: 'Save 40%',
    passTypeId: '2_weeks',
    bestValue: true,
  },
];

const FAQ = [
  {
    q: 'When does my access pass timer start?',
    a: "Your timer starts when you start your first practice exam, not when you purchase the pass. This gives you flexibility to buy now and start when you're ready.",
  },
  {
    q: 'What happens after my pass expires?',
    a: "You'll retain access to view your past exam results and scores. To take new practice exams, you'll need to purchase another access pass.",
  },
  {
    q: 'Are the practice environments real Kubernetes clusters?',
    a: 'Yes! Each practice session runs on a real KIND (Kubernetes in Docker) cluster. You get hands-on experience with actual kubectl commands, pod deployments, and cluster operations.',
  },
  {
    q: 'Can I get a refund?',
    a: "We offer full refunds within 24 hours of purchase if you haven't started any practice exams. Contact our support team for assistance.",
  },
];

export default function Pricing() {
  const { fetchWithAuth, isAuthenticated } = useAuth();
  const [checkoutError, setCheckoutError] = useState(null);

  async function initiateCheckout(passTypeId) {
    setCheckoutError(null);
    if (!isAuthenticated()) {
      window.location.href =
        '/login?redirect=' + encodeURIComponent('/pricing');
      return;
    }
    try {
      const response = await fetchWithAuth(
        '/sailor-client/api/v1/billing/checkout',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passTypeId }),
        }
      );
      if (response.ok) {
        const data = await response.json();
        if (data.data?.url) window.location.href = data.data.url;
      } else {
        const err = await response.json().catch(() => ({}));
        setCheckoutError(err.message || 'Failed to initiate checkout.');
      }
    } catch {
      setCheckoutError('Failed to initiate checkout. Please try again.');
    }
  }

  return (
    <>
      {checkoutError && (
        <div className='max-w-6xl mx-auto px-4 pt-24'>
          <div
            role='alert'
            className='rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-amber-200 text-sm flex items-center justify-between gap-4'
          >
            <span>{checkoutError}</span>
            <button
              type='button'
              onClick={() => setCheckoutError(null)}
              className='shrink-0 text-amber-400 hover:text-amber-200'
              aria-label='Dismiss'
            >
              <i className='fas fa-times' />
            </button>
          </div>
        </div>
      )}
      <section className='pt-28 pb-16 px-4 bg-gradient-to-b from-bg-card to-bg-dark'>
        <div className='max-w-4xl mx-auto text-center'>
          <h1 className='text-3xl md:text-4xl font-bold mb-3'>
            Master Kubernetes Certifications
          </h1>
          <p className='text-zinc-400 mb-6'>
            Practice with real clusters, get instant feedback, and pass your
            exam with confidence
          </p>
          <div className='flex flex-wrap justify-center gap-8'>
            <div className='flex items-center gap-3'>
              <span className='text-2xl text-primary'>
                <i className='fas fa-users' />
              </span>
              <div>
                <p className='text-2xl font-bold'>2,500+</p>
                <p className='text-zinc-500 text-sm'>Engineers Practicing</p>
              </div>
            </div>
            <div className='flex items-center gap-3'>
              <span className='text-2xl text-accent-green'>
                <i className='fas fa-check-circle' />
              </span>
              <div>
                <p className='text-2xl font-bold'>94%</p>
                <p className='text-zinc-500 text-sm'>Pass Rate</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className='py-12 px-4'>
        <div className='max-w-6xl mx-auto'>
          <div className='grid lg:grid-cols-12 gap-8'>
            <div className='lg:col-span-4 space-y-6'>
              <div className='bg-bg-card border border-zinc-800 rounded-xl p-6'>
                <h3 className='font-semibold flex items-center gap-2 mb-4'>
                  <i className='fas fa-cubes' /> What's Included
                </h3>
                {[
                  {
                    icon: 'fa-code',
                    name: 'CKAD',
                    exams: '2 practice exams',
                    iconClass: 'bg-category-ckad/20 text-category-ckad',
                  },
                  {
                    icon: 'fa-server',
                    name: 'CKA',
                    exams: '2 practice exams',
                    iconClass: 'bg-category-cka/20 text-category-cka',
                  },
                  {
                    icon: 'fa-shield-alt',
                    name: 'CKS',
                    exams: '1 practice exam',
                    iconClass: 'bg-category-cks/20 text-category-cks',
                  },
                  {
                    icon: 'fa-dharmachakra',
                    name: 'Helm',
                    exams: '1 practice exam',
                    iconClass: 'bg-category-helm/20 text-category-helm',
                  },
                  {
                    icon: 'fa-docker',
                    name: 'Docker',
                    exams: '1 practice exam',
                    iconClass: 'bg-category-docker/20 text-category-docker',
                  },
                ].map((item) => (
                  <div key={item.name} className='flex items-center gap-3 py-2'>
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.iconClass}`}
                    >
                      <i className={`fas ${item.icon}`} />
                    </div>
                    <div>
                      <span className='font-medium'>{item.name}</span>
                      <span className='text-zinc-500 text-sm block'>
                        {item.exams}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className='bg-bg-card border border-zinc-800 rounded-xl p-6'>
                <h3 className='font-semibold flex items-center gap-2 mb-4'>
                  <i className='fas fa-star' /> Why Choose DojoExam
                </h3>
                <ul className='space-y-3 text-sm text-zinc-400'>
                  <li>
                    <i className='fas fa-desktop text-primary mr-2' /> Realistic
                    Desktop Environment
                  </li>
                  <li>
                    <i className='fas fa-redo text-primary mr-2' /> Unlimited
                    Retakes
                  </li>
                  <li>
                    <i className='fas fa-server text-primary mr-2' /> Actual K8s
                    Clusters
                  </li>
                  <li>
                    <i className='fas fa-bolt text-primary mr-2' /> Instant
                    Feedback
                  </li>
                  <li>
                    <i className='fas fa-comments text-primary mr-2' /> Active
                    Community Support
                  </li>
                </ul>
              </div>
            </div>
            <div className='lg:col-span-8 space-y-6'>
              <div className='bg-bg-card border border-zinc-800 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
                <div>
                  <span className='inline-block px-3 py-1 rounded-full text-sm bg-accent-green/20 text-accent-green mb-2'>
                    <i className='fas fa-play mr-1' /> Free Trial
                  </span>
                  <p className='text-zinc-400 text-sm'>
                    Try a sample mock exam. No card required.
                  </p>
                </div>
                <Link
                  to='/'
                  className='inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-dark text-white font-medium'
                >
                  <i className='fas fa-bolt' /> Try Free
                </Link>
              </div>
              {PASSES.map((pass) => (
                <div
                  key={pass.passTypeId}
                  className={`relative bg-bg-card border rounded-xl p-6 ${
                    pass.bestValue ? 'border-primary' : 'border-zinc-800'
                  }`}
                >
                  {pass.bestValue && (
                    <div className='absolute -top-3 left-4 px-3 py-1 rounded-full text-xs font-medium bg-accent-gold/20 text-accent-gold'>
                      <i className='fas fa-crown mr-1' /> Best Value
                    </div>
                  )}
                  <h3 className='font-semibold text-lg'>{pass.name}</h3>
                  <p className='text-zinc-500 text-sm mb-2'>{pass.desc}</p>
                  <p className='text-accent-green text-sm font-medium mb-3'>
                    {pass.accessTimeLabel}
                  </p>
                  <ul className='text-sm text-zinc-400 mb-4 space-y-1'>
                    <li>
                      <i className='fas fa-check text-accent-green mr-2' /> Full
                      exam access
                    </li>
                    <li>
                      <i className='fas fa-check text-accent-green mr-2' />{' '}
                      Instant feedback
                    </li>
                    <li>
                      <i className='fas fa-check text-accent-green mr-2' />{' '}
                      Unlimited Retakes
                    </li>
                  </ul>
                  <div className='flex flex-wrap items-center gap-2 mb-4'>
                    <span className='text-2xl font-bold text-white'>
                      {pass.price}
                    </span>
                    <span className='text-zinc-500 line-through'>
                      {pass.original}
                    </span>
                    <span className='px-2 py-0.5 rounded text-xs bg-accent-green/20 text-accent-green'>
                      {pass.discount}
                    </span>
                  </div>
                  <button
                    type='button'
                    onClick={() => initiateCheckout(pass.passTypeId)}
                    className={`w-full sm:w-auto px-6 py-2.5 rounded-lg font-medium ${
                      pass.bestValue
                        ? 'bg-primary hover:bg-primary-dark text-white'
                        : 'bg-bg-surface hover:bg-bg-card border border-zinc-600 text-white'
                    }`}
                  >
                    Buy Now
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <section className='py-12 px-4 border-t border-zinc-800'>
        <div className='max-w-3xl mx-auto'>
          <h2 className='text-xl font-semibold text-center mb-8'>
            Frequently Asked Questions
          </h2>
          <div className='space-y-2'>
            {FAQ.map((item, i) => (
              <details
                key={i}
                className='bg-bg-card border border-zinc-800 rounded-lg overflow-hidden group'
              >
                <summary className='px-4 py-3 cursor-pointer list-none flex items-center justify-between text-left font-medium'>
                  {item.q}
                  <i className='fas fa-chevron-down text-zinc-500 group-open:rotate-180 transition' />
                </summary>
                <div className='px-4 py-3 border-t border-zinc-800 text-zinc-400 text-sm'>
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
