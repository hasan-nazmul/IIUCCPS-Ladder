document.addEventListener('DOMContentLoaded', () => {
  // --- DOM ELEMENTS ---
  const handleInput = document.getElementById('cf-handle-input');
  const searchBtn = document.getElementById('search-btn');
  const statusMessage = document.getElementById('status-message');

  // Page containers
  const problemsContainer = document.getElementById('problems-container');
  const analyticsContainer = document.getElementById('analytics-container');

  // Navigation links
  const problemsLink = document.getElementById('problems-link');
  const analyticsLink = document.getElementById('analytics-link');

  // Problems view elements
  const ratingNav = document.getElementById('rating-nav');
  const tagsToggle = document.getElementById('tags-toggle');
  const logicToggleGroup = document.getElementById('logic-toggle-group');
  const logicToggle = document.getElementById('logic-toggle');
  const logicLabel = document.getElementById('logic-label');
  const tagsContainer = document.getElementById('tags-container');
  const tableBody = document.getElementById('problem-table-body');

  // Analytics view elements
  const analyticsMessage = document.getElementById('analytics-message');
  const tagsPieChartCanvas = document.getElementById('tags-pie-chart');
  const ratingsBarChartCanvas = document.getElementById('ratings-bar-chart');

  // Theme Toggler
  const themeToggle = document.getElementById('theme-toggle-checkbox');

  // --- APP STATE ---
  let allProblems = [];
  let ladderProblems = [];
  let userSubmissions = [];
  let problemStatusMap = new Map();
  let tagsPieChart = null;
  let ratingsBarChart = null;

  let state = {
    selectedRating: null,
    selectedTags: new Set(),
    tagLogic: 'OR', // 'OR' or 'AND'
    cfHandle: '',
  };

  const TAGS = [
    'implementation',
    'dp',
    'math',
    'graphs',
    'data structures',
    'greedy',
    'strings',
    'binary search',
    'brute force',
    'two pointers',
    'sortings',
    'bitmasks',
    'trees',
    'constructive algorithms',
    'number theory',
    'geometry',
    'combinatorics',
    'dsu',
  ];

  // --- INITIALIZATION ---
  function init() {
    setupTheme();
    setupNavigation();
    setupEventListeners();
    setupModals();
    renderRatingNav();
    renderTags();
    loadStateFromLocalStorage();
    fetchCsvData();
    fetchProblems();
  }

  // --- THEME SETUP ---
  function setupTheme() {
    const savedTheme =
      localStorage.getItem('theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light');
    if (savedTheme === 'light') {
      document.body.classList.add('light-mode');
      themeToggle.checked = true;
    }

    themeToggle.addEventListener('change', () => {
      document.body.classList.toggle('light-mode');
      const currentTheme = document.body.classList.contains('light-mode')
        ? 'light'
        : 'dark';
      localStorage.setItem('theme', currentTheme);
    });
  }

  // --- NAVIGATION / VIEW SWITCHING ---
  function setupNavigation() {
    const navLinks = [problemsLink, analyticsLink];
    const containers = [problemsContainer, analyticsContainer];

    function switchView(targetLink, targetContainer) {
      navLinks.forEach((link) => link.classList.remove('active'));
      containers.forEach((container) => container.classList.add('hidden'));

      targetLink.classList.add('active');
      targetContainer.classList.remove('hidden');
    }

    problemsLink.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(problemsLink, problemsContainer);
    });

    analyticsLink.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(analyticsLink, analyticsContainer);
      // Generate analytics if data is available
      if (userSubmissions.length > 0) {
        generateAnalytics(userSubmissions);
      }
    });
  }

  // --- DATA FETCHING & PROCESSING ---
  async function readCsv(fileSource) {
    return new Promise((resolve, reject) => {
      Papa.parse(fileSource, {
        download: typeof fileSource === 'string',
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (error) => reject(error),
      });
    });
  }

  async function fetchCsvData() {
    try {
      const data = await readCsv('problems.csv');
      ladderProblems = data.map((row) => row.problem_links.trim());
    } catch (error) {
      updateStatus('Error loading ladder problems from CSV.');
    }
  }

  async function fetchProblems() {
    updateStatus('Loading all problems...');
    try {
      const response = await fetch(
        'https://codeforces.com/api/problemset.problems'
      );
      const data = await response.json();
      if (data.status !== 'OK') throw new Error(data.comment);

      const combinedData = data.result.problems.map((problem, index) => ({
        ...problem,
        solvedCount: data.result.problemStatistics[index].solvedCount,
      }));

      allProblems = combinedData.filter((p) => p.rating !== undefined);
      const ladderSet = new Set(ladderProblems);
      allProblems = allProblems.filter((p) =>
        ladderSet.has(`${p.contestId}${p.index}`)
      );

      updateStatus('Problems loaded. Select a rating.');
      applyFiltersAndRender();
    } catch (error) {
      updateStatus(`Error loading problems: ${error.message}`);
    }
  }

  // --- Find and replace this entire function in script.js ---

  async function fetchUserStatus() {
    const handle = handleInput.value.trim();
    if (!handle) return;

    state.cfHandle = handle;
    updateStatus(`Fetching submissions for ${handle}...`);

    // Clear previous results
    problemStatusMap.clear();
    userSubmissions = [];
    document.getElementById('profile-info-container').innerHTML = ''; // Clear profile info

    try {
      // Fetch user status and user info concurrently
      const [statusResponse, infoResponse] = await Promise.all([
        fetch(`https://codeforces.com/api/user.status?handle=${handle}`),
        fetch(`https://codeforces.com/api/user.info?handles=${handle}`),
      ]);

      if (!statusResponse.ok || !infoResponse.ok) {
        throw new Error('Could not connect to Codeforces API.');
      }

      const statusData = await statusResponse.json();
      const infoData = await infoResponse.json();

      if (statusData.status !== 'OK' || infoData.status !== 'OK') {
        // Use the more specific error message from the API if available
        throw new Error(
          statusData.comment ||
            infoData.comment ||
            'Invalid handle or API error.'
        );
      }

      // Render the profile info card
      const userInfo = infoData.result[0];
      renderProfileInfo(userInfo);

      // Process submissions
      userSubmissions = statusData.result;
      const submissions = [...userSubmissions].reverse(); // Oldest first

      submissions.forEach((sub) => {
        const problemId = `${sub.problem.contestId}${sub.problem.index}`;
        if (sub.verdict === 'OK') {
          problemStatusMap.set(problemId, 'SOLVED');
        } else if (problemStatusMap.get(problemId) !== 'SOLVED') {
          problemStatusMap.set(problemId, 'ATTEMPTED');
        }
      });

      updateStatus(`Submissions loaded for ${handle}.`);
      showToast(`CF handle "${handle}" found! 😊`, 'success');
      saveStateToLocalStorage();

      if (analyticsLink.classList.contains('active')) {
        generateAnalytics(userSubmissions);
      }
    } catch (error) {
      updateStatus(`Error: ${error.message}`);
      showToast(`CF error: ${error.message}`, 'error');
      // Ensure analytics are cleared on error
      generateAnalytics([]);
    } finally {
      applyFiltersAndRender();
    }
  }

  // --- Add these two new functions anywhere in script.js ---

  function getRankClassName(rank) {
    if (!rank) return 'rank-newbie';
    return 'rank-' + rank.toLowerCase().replace(/ /g, '-');
  }

  function renderProfileInfo(userInfo) {
    const container = document.getElementById('profile-info-container');
    if (!userInfo) {
      container.innerHTML = '';
      return;
    }

    const rankClassName = getRankClassName(userInfo.rank);

    console.log(rankClassName);

    container.innerHTML = `
        <div class="stat-block">
            <span class="stat-label">Handle</span>
            <span class="stat-value handle ${rankClassName}">${
      userInfo.handle
    }</span>
        </div>
        <div class="stat-block">
            <span class="stat-label">Rank</span>
            <span class="stat-value ${rankClassName}">${
      userInfo.rank || 'N/A'
    }</span>
        </div>
        <div class="stat-block">
            <span class="stat-label">Current Rating</span>
            <span class="stat-value">${userInfo.rating || 'N/A'}</span>
        </div>
        <div class="stat-block">
            <span class="stat-label">Max Rating</span>
            <span class="stat-value">${userInfo.maxRating || 'N/A'}</span>
        </div>
    `;
  }

  // --- UI RENDERING & FILTERING ---
  function renderRatingNav() {
    const ratings = [800, 900, 1000, 1100, 1200, 1300, 1400];
    ratingNav.innerHTML = ratings
      .map((r) => `<button class="rating-btn" data-rating="${r}">${r}</button>`)
      .join('');
  }

  function renderTags() {
    tagsContainer.innerHTML = TAGS.map(
      (tag) => `<button class="tag-btn" data-tag="${tag}">${tag}</button>`
    ).join('');
  }

  function applyFiltersAndRender() {
    if (allProblems.length === 0) return;

    let filtered = [...allProblems];

    if (state.selectedRating) {
      filtered = filtered.filter((p) => p.rating === state.selectedRating);
    } else {
      renderProblemTable([]);
      return;
    }

    if (state.selectedTags.size > 0) {
      filtered = filtered.filter((p) => {
        const problemTags = new Set(p.tags);
        if (state.tagLogic === 'OR') {
          return [...state.selectedTags].some((tag) => problemTags.has(tag));
        }
        return [...state.selectedTags].every((tag) => problemTags.has(tag));
      });
    }
    renderProblemTable(filtered);
  }

  function renderProblemTable(problems) {
    if (!tableBody) return;
    if (problems.length === 0) {
      tableBody.innerHTML =
        '<tr><td colspan="4" class="placeholder">No problems match your criteria.</td></tr>';
      return;
    }

    const rowsHtml = problems
      .map((p, index) => {
        const problemId = `${p.contestId}${p.index}`;
        const status = problemStatusMap.get(problemId);
        let statusClass = 'status-unsolved';
        let statusText = '-';

        if (status === 'SOLVED') {
          statusClass = 'status-solved';
          statusText = '✔ Solved';
        } else if (status === 'ATTEMPTED') {
          statusClass = 'status-attempted';
          statusText = '👍 Tried';
        }

        const link = `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`;
        return `
            <tr>
                <td>${index + 1}</td>
                <td><a href="${link}" target="_blank" class="problem-link">${
          p.name
        }</a></td>
                <td>${p.solvedCount || 0}</td>
                <td class="${statusClass}">${statusText}</td>
            </tr>
        `;
      })
      .join('');
    tableBody.innerHTML = rowsHtml;
  }

  // --- ANALYTICS ---
  function generateAnalytics(submissions) {
    const solvedProblems = new Map();
    submissions.forEach((sub) => {
      if (sub.verdict === 'OK') {
        const problemId = `${sub.problem.contestId}${sub.problem.index}`;
        if (!solvedProblems.has(problemId)) {
          solvedProblems.set(problemId, sub.problem);
        }
      }
    });

    if (solvedProblems.size === 0) {
      analyticsMessage.textContent =
        'No problems solved yet. Solve some problems to see your stats!';
      analyticsMessage.classList.remove('hidden');
      document.querySelector('.charts-grid').classList.add('hidden');
      return;
    }

    analyticsMessage.classList.add('hidden');
    document.querySelector('.charts-grid').classList.remove('hidden');

    // 1. Tag Analysis
    const tagCounts = {};
    solvedProblems.forEach((problem) => {
      problem.tags.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    renderTagsPieChart(tagCounts);

    // 2. Rating Analysis
    const ratingCounts = {};
    solvedProblems.forEach((problem) => {
      if (problem.rating) {
        ratingCounts[problem.rating] = (ratingCounts[problem.rating] || 0) + 1;
      }
    });
    renderRatingsBarChart(ratingCounts);
  }

  function renderTagsPieChart(tagData) {
    if (tagsPieChart) tagsPieChart.destroy();

    const sortedTags = Object.entries(tagData).sort(([, a], [, b]) => b - a);
    const topTags = sortedTags.slice(0, 10);
    const otherCount = sortedTags
      .slice(10)
      .reduce((sum, [, count]) => sum + count, 0);
    if (otherCount > 0) topTags.push(['Other', otherCount]);

    tagsPieChart = new Chart(tagsPieChartCanvas, {
      type: 'pie',
      data: {
        labels: topTags.map((item) => item[0]),
        datasets: [
          {
            label: 'Solved Problems by Tag',
            data: topTags.map((item) => item[1]),
            backgroundColor: [
              '#3B82F6',
              '#10B981',
              '#F59E0B',
              '#EF4444',
              '#8B5CF6',
              '#EC4899',
              '#6366F1',
              '#14B8A6',
              '#F97316',
              '#D946EF',
              '#6B7280',
            ],
            borderColor: getComputedStyle(document.body).getPropertyValue(
              '--bg-secondary'
            ),
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: getComputedStyle(document.body).getPropertyValue(
                '--text-secondary'
              ),
            },
          },
        },
      },
    });
  }

  function renderRatingsBarChart(ratingData) {
    if (ratingsBarChart) ratingsBarChart.destroy();

    const sortedRatings = Object.entries(ratingData).sort(([a], [b]) => a - b);

    ratingsBarChart = new Chart(ratingsBarChartCanvas, {
      type: 'bar',
      data: {
        labels: sortedRatings.map((item) => item[0]),
        datasets: [
          {
            label: 'Solved Count',
            data: sortedRatings.map((item) => item[1]),
            backgroundColor: getComputedStyle(document.body).getPropertyValue(
              '--accent-primary'
            ),
            borderColor: getComputedStyle(document.body).getPropertyValue(
              '--accent-primary'
            ),
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: getComputedStyle(document.body).getPropertyValue(
                '--text-secondary'
              ),
            },
            grid: {
              color: getComputedStyle(document.body).getPropertyValue(
                '--border-color'
              ),
            },
          },
          x: {
            ticks: {
              color: getComputedStyle(document.body).getPropertyValue(
                '--text-secondary'
              ),
            },
            grid: { display: false },
          },
        },
      },
    });
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    ratingNav.addEventListener('click', (e) => {
      if (e.target.classList.contains('rating-btn')) {
        const newRating = Number(e.target.dataset.rating);
        state.selectedRating =
          state.selectedRating === newRating ? null : newRating;
        document
          .querySelectorAll('.rating-btn')
          .forEach((btn) => btn.classList.remove('active'));
        if (state.selectedRating) e.target.classList.add('active');
        applyFiltersAndRender();
      }
    });

    searchBtn.addEventListener('click', fetchUserStatus);
    handleInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') fetchUserStatus();
    });

    tagsToggle.addEventListener('change', () => {
      tagsContainer.classList.toggle('hidden');
      logicToggleGroup.classList.toggle('hidden');
      logicToggleGroup.style.display = tagsToggle.checked ? 'flex' : 'none';
    });

    logicToggle.addEventListener('change', () => {
      state.tagLogic = logicToggle.checked ? 'AND' : 'OR';
      logicLabel.textContent = `Filter Logic: ${state.tagLogic}`;
      applyFiltersAndRender();
    });

    tagsContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('tag-btn')) {
        const tag = e.target.dataset.tag;
        if (state.selectedTags.has(tag)) {
          state.selectedTags.delete(tag);
          e.target.classList.remove('active');
        } else {
          state.selectedTags.add(tag);
          e.target.classList.add('active');
        }
        applyFiltersAndRender();
      }
    });
  }

  // --- MODALS & HELPERS ---
  function setupModals() {
    // Banner Logic
    const bannerContainer = document.getElementById('countdown-banner');
    if (bannerContainer) {
      const registrationEndDate = '2025-10-28T00:00:00';
      const daysEl = document.getElementById('days'),
        hoursEl = document.getElementById('hours');
      const minutesEl = document.getElementById('minutes'),
        secondsEl = document.getElementById('seconds');
      const closeButton = document.getElementById('banner-close'),
        ctaButton = document.getElementById('banner-cta');
      const expiredText = document.getElementById('banner-expired-text'),
        timerContainer = document.getElementById('timer-container');
      let countdownInterval;

      function updateCountdown() {
        const diff = new Date(registrationEndDate) - new Date();
        if (diff <= 0) {
          clearInterval(countdownInterval);
          timerContainer.style.display = 'none';
          expiredText.style.display = 'block';
          if (ctaButton) {
            ctaButton.textContent = 'Closed';
            ctaButton.style.pointerEvents = 'none';
            ctaButton.style.opacity = '0.6';
          }
          return;
        }
        const f = (t) => (t < 10 ? '0' + t : t);
        daysEl.textContent = f(Math.floor(diff / 864e5));
        hoursEl.textContent = f(Math.floor((diff % 864e5) / 36e5));
        minutesEl.textContent = f(Math.floor((diff % 36e5) / 6e4));
        secondsEl.textContent = f(Math.floor((diff % 6e4) / 1e3));
      }
      countdownInterval = setInterval(updateCountdown, 1000);
      updateCountdown();
      closeButton.onclick = () => {
        bannerContainer.style.display = 'none';
        clearInterval(countdownInterval);
      };
    }

    // Generic Modal Logic
    const modalTriggers = {
      'about-us-link': 'about-modal',
      'contact-link': 'contact-modal',
    };
    Object.entries(modalTriggers).forEach(([triggerId, modalId]) => {
      const trigger = document.getElementById(triggerId);
      const modal = document.getElementById(modalId);
      if (trigger && modal) {
        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          modal.classList.remove('hidden');
        });
        modal.addEventListener('click', (e) => {
          if (
            e.target === modal ||
            e.target.classList.contains('modal-close-btn')
          )
            modal.classList.add('hidden');
        });
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape')
        document
          .querySelectorAll('.modal-overlay')
          .forEach((m) => m.classList.add('hidden'));
    });

    // Contact Form Logic
    const contactForm = document.getElementById('contact-form');
    contactForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const form = event.target;
      const data = new FormData(form);
      const statusEl = document.getElementById('contact-form-status');
      const submitBtn = form.querySelector('.submit-btn');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
      statusEl.style.display = 'none';

      try {
        const response = await fetch(form.action, {
          method: form.method,
          body: data,
          headers: { Accept: 'application/json' },
        });
        if (response.ok) {
          statusEl.textContent =
            "Thanks for your message! We'll get back to you soon.";
          statusEl.className = 'form-status success';
          form.reset();
        } else {
          const responseData = await response.json();
          throw new Error(
            responseData.errors
              ? responseData.errors.map((e) => e.message).join(', ')
              : 'Oops! There was a problem.'
          );
        }
      } catch (error) {
        statusEl.textContent = error.message;
        statusEl.className = 'form-status error';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Message';
      }
    });
  }

  function updateStatus(message) {
    statusMessage.textContent = message;
  }

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.textContent = message;
    Object.assign(toast.style, {
      position: 'fixed',
      left: '50%',
      top: '20px',
      transform: 'translateX(-50%)',
      background: type === 'success' ? '#28a745' : '#dc3545',
      color: '#fff',
      padding: '10px 14px',
      borderRadius: '6px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      zIndex: 9999,
      opacity: '0',
      transition: 'opacity 240ms ease-in-out',
    });
    document.body.appendChild(toast);
    requestAnimationFrame(() => (toast.style.opacity = '1'));
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.addEventListener('transitionend', () => toast.remove(), {
        once: true,
      });
    }, 3500);
  }

  function saveStateToLocalStorage() {
    localStorage.setItem('cfLadderHandle', state.cfHandle);
  }
  function loadStateFromLocalStorage() {
    const savedHandle = localStorage.getItem('cfLadderHandle');
    if (savedHandle) {
      handleInput.value = savedHandle;
      fetchUserStatus();
    }
  }

  // --- START THE APP ---
  init();
});
