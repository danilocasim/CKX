/**
 * CKX Dashboard - user profile, access pass, exam history
 */
(function () {
  if (typeof Auth === 'undefined' || !Auth.requireAuth()) return;

  const loader = document.getElementById('dashboardLoader');
  const content = document.getElementById('dashboardContent');
  const userName = document.getElementById('userName');
  const accessStatus = document.getElementById('accessStatus');
  const examsCount = document.getElementById('examsCount');
  const examHistoryBody = document.getElementById('examHistoryBody');
  const noExams = document.getElementById('noExams');

  function showContent() {
    if (loader) loader.classList.add('d-none');
    if (content) content.classList.remove('d-none');
  }

  function setAccessStatus(text) {
    if (accessStatus) accessStatus.textContent = text;
  }

  async function loadDashboard() {
    try {
      const user = await Auth.getUser();
      if (user) {
        if (userName)
          userName.textContent = user.displayName || user.email || 'User';
      }

      const statusRes = await Auth.fetch('/sailor-client/api/v1/access/status');
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const d = statusData.data || statusData;
        if (d.hasAccess || d.hasValidPass) {
          const remain =
            d.remainingHuman ||
            (d.hoursRemaining != null ? d.hoursRemaining + ' hours' : null) ||
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
      } else {
        setAccessStatus('No active pass. Mock exams are free.');
      }

      const statsRes = await Auth.fetch('/sailor-client/api/v1/users/me/stats');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        const s = statsData.data || statsData;
        if (examsCount)
          examsCount.textContent =
            (s.examsCompleted || s.totalExams || 0) + ' completed';
      } else if (examsCount) {
        examsCount.textContent = '0 completed';
      }

      const examsRes = await Auth.fetch('/sailor-client/api/v1/users/me/exams');
      if (examsRes.ok) {
        const examsData = await examsRes.json();
        const list = examsData.data || examsData.exams || [];
        if (Array.isArray(list) && list.length > 0) {
          examHistoryBody.innerHTML = list
            .slice(0, 10)
            .map(function (e) {
              const date = e.completedAt || e.startedAt || e.createdAt;
              const dateStr = date ? new Date(date).toLocaleDateString() : '—';
              const score =
                e.score != null && e.maxScore != null
                  ? Math.round((e.score / e.maxScore) * 100) + '%'
                  : '—';
              return (
                '<tr><td>' +
                (e.labId || e.lab_id || '—') +
                '</td><td>' +
                score +
                '</td><td>' +
                dateStr +
                '</td><td>' +
                (e.status || '—') +
                '</td></tr>'
              );
            })
            .join('');
        } else {
          examHistoryBody.innerHTML = '';
          if (noExams) noExams.classList.remove('d-none');
        }
      } else {
        if (noExams) noExams.classList.remove('d-none');
      }

      showContent();
    } catch (e) {
      setAccessStatus('Could not load access status.');
      if (examsCount) examsCount.textContent = '—';
      if (noExams) noExams.classList.remove('d-none');
      showContent();
    }
  }

  loadDashboard();
})();
