/**
 * Core Application Engine Framework
 * Managing routing, Supabase database sync, and view lifecycle management.
 */

// Simulated User Configuration - Fallback values
const userProfile = {
    name: "user",
    role: "Computer Science - Year 2"
};

// Global storage caching to avoid spamming database calls on every keystroke
let allCoursesCache = [];

// ==========================================
// ====== CORE VIEW ROUTER & LIFECYCLE ======
// ==========================================

async function loadPage(page) {
    try {
        const response = await fetch(page);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.text();
        const mainContent = document.getElementById("main-content");

        if (mainContent) {
            // 1. Inject the HTML into the page first
            mainContent.innerHTML = data;
            closeSidebarOnMobile();

            // 2. Trigger the correct database sync functions based on structural views
            if (page === 'courses.html') {
                console.log("⚡ Router Active: Running Courses Catalog Sync...");
                synchronizePortalCatalog();
            }
            else if (page === 'enrollment.html') {
                console.log("⚡ Router Active: Running Enrollments Sync...");
                synchronizeMyEnrollments();
            }
            else if (page === 'main.html') {
                console.log("⚡ Router Active: Initializing Dashboard...");
                initializeDashboard();
            }
        } else {
            console.error("❌ Error: Target element '#main-content' was not found in the DOM.");
        }
    } catch (error) {
        console.error("Error loading the page:", error);
    }
}

// Automatically load the dashboard tab when the user first opens the application
document.addEventListener('DOMContentLoaded', () => {
    loadPage('main.html');
});

// Sidebar visual highlight state toggler
document.addEventListener('click', function (e) {
    const clickedNavItem = e.target.closest('.nav-item');
    if (clickedNavItem) {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        clickedNavItem.classList.add('active');
    }
});

// ============================================
// ====== AUTHENTICATION & AUTHORIZATION ======
// ============================================

async function verifyAdminAuthorization() {
    try {
        const studentReg = localStorage.getItem('student_reg');
        if (!studentReg) return;

        // Fetching student context from database to confirm administrative privileges
        const { data: student, error } = await _supabase
            .from('students')
            .select('email')
            .eq('registration_number', studentReg)
            .single();

        if (error || !student) return;


        // Grant admin access if the name is Haron or matches your specific registration number
        if (student.name.includes("Haron") || student.registration_number === "COM/0227/24") {
            const adminTab = document.getElementById('admin-add-course');
            if (adminTab) {
                adminTab.style.setProperty('display', 'flex', 'important');
                console.log("🔓 Admin Access Granted for Haron.");
            }

        }
    } catch (err) {
        console.error("Security verification context exception:", err);
    }
}

// Bootstrap App Session Profiles Initialization
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const studentReg = localStorage.getItem('student_reg');

        if (!studentReg) {
            console.warn("No active student token found. Redirecting.");
            fallbackProfileUI();
            return;
        }

        // Pull full fresh row payload coordinates for authenticated account
        const { data: student, error } = await _supabase
            .from('students')
            .select('*')
            .eq('registration_number', studentReg)
            .single();

        if (student && !error) {
            const fullStudentName = student.name || "Student";
            const firstName = fullStudentName.split(' ')[0];
            const firstNameCapitalized = firstName.charAt(0).toUpperCase() + firstName.slice(1);

            userProfile.name = fullStudentName;
            userProfile.role = `${student.department || 'Computer Science'} - ${student.year_of_study || 'Year 2'}`;
            userProfile.email = student.email;

            // Map variables directly to UI Elements
            const profileNameEl = document.getElementById('profile-name-text');
            const profileRegEl = document.getElementById('profile-reg-text');
            const profileDeptEl = document.getElementById('profile-dept-text');
            const profileRoleEl = document.getElementById('profile-role-text');
            const profileAvatarEl = document.getElementById('profile-avatar');
            const greetingEl = document.getElementById('dynamic-greeting');

            if (profileNameEl) profileNameEl.innerText = fullStudentName;
            if (profileRegEl) profileRegEl.innerText = student.registration_number;
            if (profileDeptEl) profileDeptEl.innerText = student.department;
            if (profileRoleEl) profileRoleEl.innerText = userProfile.role;

            // Extract cleanly structured initials into your avatar frame
            if (profileAvatarEl) {
                const rawInitials = fullStudentName.split(' ').map(n => n[0]).join('').toUpperCase();
                profileAvatarEl.innerText = rawInitials.substring(0, 2);
            }

            // Temporal greeting engine calculation loop using First Name
            const hour = new Date().getHours();
            let greetingStr = "Welcome back";
            if (hour < 12) greetingStr = "Good morning";
            else if (hour < 18) greetingStr = "Good afternoon";
            else greetingStr = "Good evening";

            if (greetingEl) greetingEl.innerText = `${greetingStr}, ${firstNameCapitalized}!`;

            // ✅ FIXED: Updated to use unified credentials instead of old target email string
            if ((student.name && student.name.includes("Haron")) || student.registration_number === "COM/0227/24") {
                const adminTab = document.getElementById('admin-add-course');
                if (adminTab) {
                    adminTab.style.setProperty('display', 'flex', 'important');
                    console.log("🔓 Admin Access Granted for Haron inside session initializer.");
                }
            }
        } else {
            fallbackProfileUI();
        }
    } catch (err) {
        console.error('Error fetching user data, falling back to default:', err);
        fallbackProfileUI();
    }

    // Fallback double-check trigger execution
    await verifyAdminAuthorization();
});

function fallbackProfileUI() {
    const profileNameEl = document.getElementById('profile-name-text');
    const profileRegEl = document.getElementById('profile-reg-text');
    const profileRoleEl = document.getElementById('profile-role-text');
    const profileAvatarEl = document.getElementById('profile-avatar');

    if (profileNameEl) profileNameEl.innerText = userProfile.name;
    if (profileRegEl) profileRegEl.innerText = localStorage.getItem('student_reg') || "Not Signed In";
    if (profileRoleEl) profileRoleEl.innerText = userProfile.role;
    if (profileAvatarEl) profileAvatarEl.innerText = userProfile.name.substring(0, 2).toUpperCase();
}

// ==========================================================
// ====== ENROLLMENT OPERATIONS & CATALOG DISCOVERY =========
// ==========================================================
async function synchronizeMyEnrollments() {
    const gridContainer = document.getElementById('my-enrollments-grid');
    if (!gridContainer) return;

    // Apply basic grid styling to the container to ensure it wraps cards properly
    gridContainer.style.display = 'grid';
    gridContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
    gridContainer.style.gap = '1.5rem';
    gridContainer.style.padding = '1rem 0';

    try {
        const studentReg = localStorage.getItem('student_reg');
        if (!studentReg) throw new Error("Student registration token session missing.");

        // ✅ FIXED: Fetch entries tracking across 'student_reg_number' and pull relational parameters cleanly
        const { data: enrollmentRecords, error: enrollmentError } = await _supabase
            .from('enrollments')
            .select('id, course_code, course_title, lecturer_name')
            .eq('student_reg_number', studentReg);

        if (enrollmentError) throw enrollmentError;

        if (!enrollmentRecords || enrollmentRecords.length === 0) {
            gridContainer.innerHTML = `
                <div class="empty-state-container">
                    <div class="empty-state-icon">🎓</div>
                    <h2 class="empty-state-title">No Active Enrollments</h2>
                    <p class="empty-state-message">You haven't enrolled in any courses yet.</p>
                    <p class="empty-state-hint">Head over to <strong>"Browse Courses"</strong> to explore and enroll in courses for your semester!</p>
                </div>`;
            return;
        }

        gridContainer.innerHTML = '';

        enrollmentRecords.forEach(enrollment => {
            const structuralImageCover = `https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=600&q=80&sig=${enrollment.course_code}`;

            // 🟢 Self-contained layout mappings linked directly to the enrollments table parameters
            const cardNodeMarkup = `
                <div class="course-card" style="background: rgba(2, 14, 46, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 1rem; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.2s ease;">
                    <div class="course-image" style="position: relative; width: 100%; height: 180px; overflow: hidden;">
                        <span class="year-badge" style="position: absolute; top: 12px; left: 12px; background: #3b82f6; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: bold; z-index: 2;">
                            Year 2
                        </span>
                        <img src="${structuralImageCover}" alt="${enrollment.course_title} Cover" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <div class="course-info" style="padding: 1.25rem; flex-grow: 1; display: flex; flex-direction: column; gap: 0.5rem;">
                        <span class="course-code" style="color: #3b82f6; font-size: 0.85rem; font-weight: 600;">🆔 ${enrollment.course_code}</span>
                        <h3 style="margin: 0; font-size: 1.2rem; color: #ffffff; line-height: 1.4;">${enrollment.course_title}</h3>
                        <div class="lecturer-info" style="display: flex; align-items: center; gap: 0.5rem; color: #94a3b8; font-size: 0.9rem; margin-top: auto; padding-top: 0.5rem;">
                            <span>👨‍🏫</span>
                            <span>${enrollment.lecturer_name || 'Department Faculty'}</span>
                        </div>
                    </div>
                    <div class="course-actions" style="padding: 0 1.25rem 1.25rem 1.25rem;">
                        <button class="btn-card-drop" onclick="cancelEnrollment('${enrollment.id}')">
                            ❌ Unenrol me
                        </button>
                    </div>
                </div>`;
            gridContainer.insertAdjacentHTML('beforeend', cardNodeMarkup);
        });
    } catch (err) {
        console.error("Enrollment loading failure:", err);
        gridContainer.innerHTML = `
            <div class="catalog-loader" style="color:#ff6b6b; padding: 2rem; text-align: center; grid-column: 1/-1;">
                <h3>⚠️ Synchronization Blocked</h3>
                <p>${err.message || 'Check database table configurations.'}</p>
            </div>`;
    }
}

// ✅ FIXED: Completely remmapped variables to use dynamic registration number strings
async function executeStudentEnrollment(courseCode, courseTitle, lecturerName) {
    if (!courseCode) {
        showPopupNotification("Invalid course selection string parameters.", 'error');
        return;
    }

    try {
        const studentReg = localStorage.getItem('student_reg');
        if (!studentReg) throw new Error("Authentication matching token required. Please log in.");

        // ✅ FIXED: Payload strictly matches structural schema dependencies
        const { error } = await _supabase
            .from('enrollments')
            .insert([
                {
                    student_reg_number: studentReg,
                    course_code: courseCode,
                    course_title: courseTitle,
                    lecturer_name: lecturerName
                }
            ]);

        if (error) throw error;

        showPopupNotification(`Successfully enrolled in ${courseCode}! 🎉`, 'success');
        synchronizePortalCatalog();
    } catch (err) {
        showPopupNotification(`Enrollment failed: ${err.message}`, 'error');
    }
}

async function cancelEnrollment(enrollmentId) {
    if (!confirm("Are you sure you want to drop this course module?")) return;

    try {
        const { error } = await _supabase
            .from('enrollments')
            .delete()
            .eq('id', enrollmentId);

        if (error) throw error;

        showPopupNotification("Course successfully dropped.", 'success');
        synchronizeMyEnrollments();
    } catch (err) {
        showPopupNotification(err.message, 'error');
    }
}

async function synchronizePortalCatalog() {
    const gridContainer = document.getElementById('course-grid-mount');
    if (!gridContainer) return;

    try {
        const { data: records, error } = await _supabase
            .from('courses')
            .select('*')
            .order('course_code', { ascending: true });

        if (error) throw error;

        allCoursesCache = records || [];
        renderCatalogCards(allCoursesCache);
    } catch (err) {
        console.error("Catalog Pipeline Broken Exception:", err);
        gridContainer.innerHTML = `<div class="catalog-loader" style="color:#ff6b6b;">⚠️ System failed to pull database entries: ${err.message}</div>`;
    }
}

function filterLoadedCourses(searchString) {
    const query = searchString.toLowerCase().trim();
    const filteredResults = allCoursesCache.filter(module => {
        return module.course_code.toLowerCase().includes(query) ||
            module.course_name.toLowerCase().includes(query) ||
            module.lecturer.toLowerCase().includes(query);
    });
    renderCatalogCards(filteredResults);
}

function renderCatalogCards(courseArray) {
    const gridContainer = document.getElementById('course-grid-mount');
    if (!gridContainer) return;

    if (courseArray.length === 0) {
        gridContainer.innerHTML = `
            <div class="catalog-loader">
                <h3>🔍 No matching results found</h3>
                <p>Try refining your search keyword strings.</p>
            </div>`;
        return;
    }

    gridContainer.innerHTML = '';

    courseArray.forEach(module => {
        const structuralImageCover = `https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=600&q=80&sig=${module.course_code}`;

        // Pass string values inside single quotes safely to avoid injection parsing errors
        const sanitizedTitle = module.course_name.replace(/'/g, "\\'");
        const sanitizedLecturer = module.lecturer.replace(/'/g, "\\'");

        const cardNodeMarkup = `
            <div class="course-card-node">
                <div class="card-image-canvas">
                    <span class="card-academic-badge">${module.year_taught || 'Core'}</span>
                    <img src="${structuralImageCover}" alt="${module.course_name} Graphic Overview" onerror="this.src='https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?q=80&w=600&auto=format&fit=crop'">
                </div>
                <div class="card-details-context">
                    <span class="card-course-code">🆔 ${module.course_code}</span>
                    <h3 class="card-course-title">${module.course_name}</h3>
                    <div class="card-lecturer-row">
                        <span>👨‍🏫</span>
                        <span>${module.lecturer}</span>
                    </div>
                </div>
                <div class="card-action-bar">
                    <button class="btn-card-enroll" onclick="executeStudentEnrollment('${module.course_code}', '${sanitizedTitle}', '${sanitizedLecturer}')">
                        <span>⚡</span> Fast Enroll
                    </button>
                </div>
            </div>`;
        gridContainer.insertAdjacentHTML('beforeend', cardNodeMarkup);
    });
}

// ==========================================
// ========== DASHBOARD COMPONENT ===========
// ==========================================

async function initializeDashboard() {
    await new Promise(resolve => setTimeout(resolve, 150));
    await loadEnrollmentStats();
}

async function loadEnrollmentStats() {
    try {
        const studentReg = localStorage.getItem('student_reg');
        if (!studentReg) return;

        // ✅ FIXED: Counts parameters tied uniquely to registration keys
        const { data: enrollmentRecords, error: enrollmentError } = await _supabase
            .from('enrollments')
            .select('*')
            .eq('student_reg_number', studentReg);

        if (enrollmentError) throw enrollmentError;

        const finalEnrollments = enrollmentRecords || [];
        const totalEnrolled = finalEnrollments.length;

        const inProgress = totalEnrolled;
        const completed = 0;

        // Map numeric indicators into display cards safely
        const statEnrolled = document.getElementById('stat-enrolled');
        const statInProgress = document.getElementById('stat-in-progress');
        const statCompleted = document.getElementById('stat-completed');

        if (statEnrolled) statEnrolled.innerText = totalEnrolled;
        if (statInProgress) statInProgress.innerText = inProgress;
        if (statCompleted) statCompleted.innerText = completed;

        // Visual completion progress tracking mapping loaders
        const overallPercentEl = document.getElementById('overall-percent');
        const overallBarEl = document.getElementById('overall-bar');
        const semesterPercentEl = document.getElementById('semester-percent');
        const semesterBarEl = document.getElementById('semester-bar');

        if (totalEnrolled > 0) {
            if (overallPercentEl) overallPercentEl.innerText = '0%';
            if (overallBarEl) overallBarEl.style.width = '0%';

            const semesterPercent = 100; // All active modules are set to "In Progress"
            if (semesterPercentEl) semesterPercentEl.innerText = semesterPercent + '%';
            if (semesterBarEl) semesterBarEl.style.width = semesterPercent + '%';
        } else {
            resetProgressUI();
        }

        // System activity tracker dynamic synchronization logger
        if (finalEnrollments.length > 0) {
            const recentEnrollments = finalEnrollments
                .sort((a, b) => new Date(b.enrolled_at) - new Date(a.enrolled_at))
                .slice(0, 3);

            const activityContainer = document.getElementById('activity-container');
            if (activityContainer) {
                activityContainer.innerHTML = '';
                recentEnrollments.forEach(enrollment => {
                    const timeAgo = getTimeAgo(new Date(enrollment.enrolled_at));
                    addActivity(`Enrolled in ${enrollment.course_title}`, timeAgo);
                });
            }
        }
    } catch (err) {
        console.error('Error loading enrollment statistics context:', err);
    }
}

function resetProgressUI() {
    ['overall-percent', 'semester-percent'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = '0%';
    });
    ['overall-bar', 'semester-bar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.width = '0%';
    });
}

function addActivity(message, time) {
    const activityContainer = document.getElementById('activity-container');
    if (!activityContainer) return;

    const newActivity = document.createElement('div');
    newActivity.className = 'activity-item';
    newActivity.innerHTML = `
        <div class="activity-dot"></div>
        <div class="activity-content">
            <h4>${message}</h4>
            <div class="activity-time">${time}</div>
        </div>`;
    activityContainer.appendChild(newActivity);
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
}

// ============================================
// ========== ADMIN CONTEXT CONTROL ===========
// ============================================

async function handleCourseProvisioning(event) {
    event.preventDefault();

    const codeInput = document.getElementById('course-code-input');
    const nameInput = document.getElementById('course-name-input');
    const lecturerInput = document.getElementById('course-lecturer-input');
    const yearSelect = document.getElementById('course-year-input');

    if (!codeInput || !nameInput || !lecturerInput || !yearSelect) {
        showPopupNotification("Form fields missing in current view.", 'error');
        return;
    }

    const courseCode = codeInput.value.trim();
    const courseName = nameInput.value.trim();
    const lecturer = lecturerInput.value.trim();
    const yearTaught = yearSelect.value;

    try {
        const { error } = await _supabase
            .from('courses')
            .insert([{ course_code: courseCode, course_name: courseName, lecturer: lecturer, year_taught: yearTaught }]);

        if (error) {
            if (error.code === '23505') throw new Error(`The course code "${courseCode}" already exists!`);
            throw error;
        }

        showPopupNotification(`"${courseCode}" successfully deployed! 🎉`, 'success');
        document.getElementById('admin-course-form').reset();
        allCoursesCache = []; // Flushes storage array data to require fresh pull on next view transition
    } catch (error) {
        showPopupNotification(error.message || "Failed to provision module.", 'error');
    }
}

// ==========================================
// ========== RESPONSIVE & TOASTS ===========
// ==========================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('active');
    if (overlay) overlay.classList.toggle('active');
}

function closeSidebarOnMobile() {
    if (window.innerWidth < 1024) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
    }
}

function showPopupNotification(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-card ${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '🚀' : '❌'}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 400);
    }, 2000);
}
function handleSignOut() {
    console.log("Clearing active app session parameters...");

    // Clear registration tokens from localStorage
    localStorage.removeItem('student_reg');

    // 💡 FIXED: Redirect to Django's root URL '/' where your login view lives
    window.location.href = '/';
}