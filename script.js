/**
 * Asynchronously reads and parses a CSV file.
 *
 * @param {File|string} fileSource - The source of the CSV. Can be a File object
 *   (from an <input type="file">) or a string URL to a CSV file.
 * @returns {Promise<Array<Object>>} A promise that resolves with an array of objects,
 *   where each object represents a row in the CSV. Rejects on error.
 */
async function readCsv(fileSource) {
  return new Promise((resolve, reject) => {
    Papa.parse(fileSource, {
      // If the file is a URL, PapaParse needs to download it.
      download: typeof fileSource === 'string',

      // Treat the first row as the header row.
      header: true,

      // Ignore empty lines in the CSV.
      skipEmptyLines: true,

      // The callback function to run when parsing is complete.
      complete: (results) => {
        // results.data contains the array of objects.
        resolve(results.data);
      },

      // The callback function to run if an error occurs.
      error: (error) => {
        reject(error);
      },
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM ELEMENTS ---
  const ratingNav = document.getElementById('rating-nav');
  const handleInput = document.getElementById('cf-handle-input');
  const searchBtn = document.getElementById('search-btn');
  const tagsToggle = document.getElementById('tags-toggle');
  const logicToggleGroup = document.getElementById('logic-toggle-group');
  const logicToggle = document.getElementById('logic-toggle');
  const logicLabel = document.getElementById('logic-label');
  const tagsContainer = document.getElementById('tags-container');
  const tableBody = document.getElementById('problem-table-body');
  const statusMessage = document.getElementById('status-message');

  // --- APP STATE ---
  let allProblems = [];
  let ladderProblems = [];
  let problemStatusMap = new Map();
  let state = {
    selectedRating: null,
    selectedTags: new Set(),
    tagLogic: 'OR', // 'OR' or 'AND'
    cfHandle: '',
  };

  // --- TAGS LIST --- (A curated list for better UX)
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
    renderRatingNav();
    renderTags();
    setupEventListeners();
    loadStateFromLocalStorage();
    csvdata();
    fetchProblems();
    modalActivities();
  }

  async function csvdata() {
    const data = await readCsv('problems.csv');

    ladderProblems = data.map((row) => {
      return row.problem_links;
    });
  }

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

  // --- API FETCHING ---
  // --- API FETCHING ---
  async function fetchProblems() {
    updateStatus('Loading all problems...');
    try {
      const response = await fetch(
        'https://codeforces.com/api/problemset.problems'
      );
      const data = await response.json();
      if (data.status === 'OK') {
        // --- START OF CHANGES ---

        // 1. Get BOTH the problems array and the statistics array
        const problems = data.result.problems;
        const stats = data.result.problemStatistics;

        // 2. Merge them into a single array.
        // The two arrays are parallel, meaning problems[i] corresponds to stats[i].
        // We'll create a new array where each object has properties from both.
        const combinedData = problems.map((problem, index) => {
          return {
            ...problem, // Copy all properties from the problem object
            solvedCount: stats[index].solvedCount, // Add the solvedCount from the corresponding stats object
          };
        });

        // 3. Use this new combined array for all subsequent operations.
        // We still filter out problems that don't have a rating.
        allProblems = combinedData.filter((p) => p.rating !== undefined);

        // --- END OF CHANGES ---

        // The rest of your logic remains the same!
        // It now operates on objects that include the solvedCount.
        const ladderSet = new Set(ladderProblems.map((s) => String(s).trim()));
        const ladderMapped = allProblems.filter((p) =>
          ladderSet.has(`${p.contestId}${p.index}`)
        );

        allProblems = ladderMapped;

        updateStatus('Problems loaded. Select a rating.');
        applyFiltersAndRender();
      } else {
        throw new Error(data.comment);
      }
    } catch (error) {
      updateStatus(`Error loading problems: ${error.message}`);
    }
  }

  async function fetchUserStatus() {
    const handle = handleInput.value.trim();
    if (!handle) return;

    state.cfHandle = handle;
    updateStatus(`Fetching submissions for ${handle}...`);
    problemStatusMap.clear(); // Clear the map before fetching

    try {
      const response = await fetch(
        `https://codeforces.com/api/user.status?handle=${handle}`
      );
      const data = await response.json();

      if (data.status === 'OK') {
        // --- START OF CHANGES FOR STATUS LOGIC ---

        // Process submissions from oldest to newest to get the final status.
        // The API returns newest first, so we reverse it.
        const submissions = data.result.reverse();

        submissions.forEach((sub) => {
          const problemId = `${sub.problem.contestId}${sub.problem.index}`;

          if (sub.verdict === 'OK') {
            // If any submission is 'OK', the problem is solved. This will overwrite any 'ATTEMPTED' status.
            problemStatusMap.set(problemId, 'SOLVED');
          } else {
            // If the problem is not already marked as solved, mark it as attempted.
            if (problemStatusMap.get(problemId) !== 'SOLVED') {
              problemStatusMap.set(problemId, 'ATTEMPTED');
            }
          }
        });
        // --- END OF CHANGES FOR STATUS LOGIC ---

        updateStatus(`Submissions loaded for ${handle}.`);
        // show success toast
        const toast = document.createElement('div');
        toast.textContent = `CF handle "${handle}" found! 😊`;
        Object.assign(toast.style, {
          position: 'fixed',
          left: '50%',
          top: '20px',
          transform: 'translateX(-50%)',
          background: '#28a745',
          color: '#fff',
          padding: '10px 14px',
          borderRadius: '6px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          zIndex: 9999,
          opacity: '0',
          transition: 'opacity 240ms ease',
        });
        document.body.appendChild(toast);
        requestAnimationFrame(() => (toast.style.opacity = '1'));
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.addEventListener('transitionend', () => toast.remove(), {
            once: true,
          });
        }, 3000);
        saveStateToLocalStorage();
      } else {
        // ... (rest of the error handling code is the same)
        const errMsg = data.comment || 'Unknown error from Codeforces API';
        updateStatus(`Error: ${errMsg}`);

        const toast = document.createElement('div');
        toast.textContent = `CF error: ${errMsg}`;
        Object.assign(toast.style, {
          position: 'fixed',
          left: '50%',
          top: '20px',
          transform: 'translateX(-50%)',
          background: '#dc3545',
          color: '#fff',
          padding: '10px 14px',
          borderRadius: '6px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          zIndex: 9999,
          opacity: '0',
          transition: 'opacity 240ms ease',
        });
        document.body.appendChild(toast);
        requestAnimationFrame(() => (toast.style.opacity = '1'));
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.addEventListener('transitionend', () => toast.remove(), {
            once: true,
          });
        }, 3500);
        throw new Error(data.comment);
      }
    } catch (error) {
      updateStatus(`Error fetching user status: ${error.message}`);
    } finally {
      applyFiltersAndRender();
    }
  }

  // --- FILTERING AND RENDERING ---
  function applyFiltersAndRender() {
    if (allProblems.length === 0) return;

    let filtered = [...allProblems];

    // Filter by rating
    if (state.selectedRating) {
      filtered = filtered.filter((p) => p.rating === state.selectedRating);
    } else {
      renderProblemTable([]); // Don't show anything if no rating is selected
      return;
    }

    // Filter by tags
    if (state.selectedTags.size > 0) {
      filtered = filtered.filter((p) => {
        const problemTags = new Set(p.tags);
        if (state.tagLogic === 'OR') {
          return [...state.selectedTags].some((tag) => problemTags.has(tag));
        } else {
          // AND
          return [...state.selectedTags].every((tag) => problemTags.has(tag));
        }
      });
    }

    renderProblemTable(filtered);
  }

  function renderProblemTable(problems) {
    tableBody.innerHTML = '';
    if (problems.length === 0) {
      tableBody.innerHTML =
        '<tr><td colspan="5" class="placeholder">No problems match your criteria.</td></tr>';
      return;
    }

    problems.forEach((p, index) => {
      const problemId = `${p.contestId}${p.index}`;
      const status = problemStatusMap.get(problemId); // Get the status from the map

      let statusClass = 'status-unsolved';
      let statusIcon = '-';

      if (status === 'SOLVED') {
        statusClass = 'status-solved';
        statusIcon = '✔ Solved';
      } else if (status === 'ATTEMPTED') {
        statusClass = 'status-attempted';
        statusIcon = '👍Tried'; // Or 'Attempted'
      }

      const link = `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`;

      const row = `
            <tr>
                <td>${index + 1}</td>
                <td><a href="${link}" target="_blank" class="problem-link">${
        p.name
      }</a></td>
                <td>${Number(p.solvedCount) || 0}</td>
                <td class="${statusClass}">${statusIcon}</td>
            </tr>
        `;
      tableBody.innerHTML += row;
    });
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    ratingNav.addEventListener('click', (e) => {
      if (e.target.classList.contains('rating-btn')) {
        const newRating = Number(e.target.dataset.rating);
        state.selectedRating =
          state.selectedRating === newRating ? null : newRating;

        // Update UI
        document
          .querySelectorAll('.rating-btn')
          .forEach((btn) => btn.classList.remove('active'));
        if (state.selectedRating) {
          e.target.classList.add('active');
        }

        applyFiltersAndRender();
      }
    });

    searchBtn.addEventListener('click', fetchUserStatus);
    handleInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') fetchUserStatus();
    });

    tagsToggle.addEventListener('change', () => {
      tagsContainer.classList.toggle('hidden');
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

  // --- HELPERS ---
  function updateStatus(message) {
    statusMessage.textContent = message;
  }

  function saveStateToLocalStorage() {
    localStorage.setItem('cfFinderHandle', state.cfHandle);
  }

  function loadStateFromLocalStorage() {
    const savedHandle = localStorage.getItem('cfFinderHandle');
    if (savedHandle) {
      handleInput.value = savedHandle;
      fetchUserStatus();
    }
  }

  function modalActivities() {
    // Placeholder for any modal activities if needed in the future
    // --- MODAL CONTROL LOGIC ---
    const aboutUsLink = document.getElementById('about-us-link');
    const aboutModal = document.getElementById('about-modal');

    // Function to open the modal
    const openModal = () => {
      aboutModal.classList.remove('hidden');
    };

    // Function to close the modal
    const closeModal = () => {
      aboutModal.classList.add('hidden');
    };

    // Event listener to open modal
    aboutUsLink.addEventListener('click', (event) => {
      event.preventDefault(); // Prevents the link from jumping to the top of the page
      openModal();
    });

    // Event listeners to close the modal
    aboutModal.addEventListener('click', (event) => {
      // Closes if the dark overlay is clicked or the close button is clicked
      if (
        event.target.classList.contains('modal-overlay') ||
        event.target.classList.contains('modal-close-btn')
      ) {
        closeModal();
      }
    });

    // Also allow closing with the 'Escape' key for better accessibility
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !aboutModal.classList.contains('hidden')) {
        closeModal();
      }
    });

    // --- CONTACT MODAL & FORM SUBMISSION LOGIC ---
    const contactLink = document.getElementById('contact-link');
    const contactModal = document.getElementById('contact-modal');
    const contactForm = document.getElementById('contact-form');
    const contactFormStatus = document.getElementById('contact-form-status');

    // Event listener to open the contact modal
    contactLink.addEventListener('click', (event) => {
      event.preventDefault();
      contactModal.classList.remove('hidden');
    });

    // Event listeners to close the contact modal
    contactModal.addEventListener('click', (event) => {
      if (
        event.target.classList.contains('modal-overlay') ||
        event.target.classList.contains('modal-close-btn')
      ) {
        contactModal.classList.add('hidden');
      }
    });
    document.addEventListener('keydown', (event) => {
      if (
        event.key === 'Escape' &&
        !contactModal.classList.contains('hidden')
      ) {
        contactModal.classList.add('hidden');
      }
    });

    // Handle the form submission using Fetch API (AJAX)
    contactForm.addEventListener('submit', async function (event) {
      event.preventDefault(); // Stop the default browser submission

      const form = event.target;
      const data = new FormData(form);
      const submitButton = form.querySelector('.submit-btn');

      // Disable button to prevent multiple submissions
      submitButton.disabled = true;
      submitButton.textContent = 'Sending...';

      try {
        const response = await fetch(form.action, {
          method: form.method,
          body: data,
          headers: {
            Accept: 'application/json',
          },
        });

        if (response.ok) {
          contactFormStatus.textContent =
            "Thanks for your message! We'll get back to you soon.";
          contactFormStatus.className = 'form-status success';
          form.reset(); // Clear the form fields
        } else {
          // Handle server-side validation errors from Formspree
          const responseData = await response.json();
          if (responseData.errors) {
            const errorMsg = responseData.errors
              .map((error) => error.message)
              .join(', ');
            throw new Error(errorMsg);
          } else {
            throw new Error('Oops! There was a problem submitting your form.');
          }
        }
      } catch (error) {
        contactFormStatus.textContent =
          error.message || 'An unknown error occurred.';
        contactFormStatus.className = 'form-status error';
      } finally {
        // Re-enable the button
        submitButton.disabled = false;
        submitButton.textContent = 'Send Message';
      }
    });
  }

  // --- START THE APP ---
  init();
});
