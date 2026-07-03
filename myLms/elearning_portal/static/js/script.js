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
            /* ========================================================
               NEW ROUTE: LECTURER PORTAL
               ======================================================== */
            else if (page === 'lecturer_panel.html') {
                console.log("⚡ Router Active: Initializing Lecturer Panel...");

                // Manually find and execute the dynamic dropdown script inside lecturer_panel.html
                const scriptTags = mainContent.querySelectorAll("script");
                scriptTags.forEach(oldScript => {
                    const newScript = document.createElement("script");
                    newScript.text = oldScript.text;
                    document.body.appendChild(newScript).parentNode.removeChild(newScript);
                });

                // Re-bind the Form Submit event listener to this fresh DOM structure
                initializeLecturerFormListener();
                populateLecturerCoursesDropdown();
            }
        } else {
            console.error("❌ Error: Target element '#main-content' was not found in the DOM.");
        }
    } catch (error) {
        console.error("Error loading the page:", error);
    }
}

/**
 * Clean helper function to bind the form submit event listener safely 
 * whenever the lecturer view is mounted into the viewport.
 */
function initializeLecturerFormListener() {
    const uploadForm = document.getElementById('lecturer-upload-form');
    if (!uploadForm) return;

    // Remove any old duplicate listeners before adding a fresh one
    uploadForm.replaceWith(uploadForm.cloneNode(true));
    const cleanForm = document.getElementById('lecturer-upload-form');

    cleanForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const submitBtn = document.getElementById('publish-content-btn');
        submitBtn.innerText = "⏳ Uploading & Publishing Materials...";
        submitBtn.disabled = true;

        const courseCode = document.getElementById('lecturer-course-select').value;
        const moduleTitle = document.getElementById('lecturer-module-title').value.trim();
        const lessonTitle = document.getElementById('lecturer-lesson-title').value.trim();
        const fileTarget = document.getElementById('lecturer-file-input').files[0];

        try {
            if (!fileTarget) throw new Error("Please specify a document resource artifact to publish.");

            // 1. Upload File to Supabase Storage Bucket
            const sanitizedFileName = `${Date.now()}_${fileTarget.name.replace(/\s+/g, '_')}`;
            const filePath = `${courseCode}/${sanitizedFileName}`;

            console.log("📡 Staging file storage handshake for:", filePath);
            const { data: uploadData, error: uploadErr } = await _supabase.storage
                .from('course-resources')
                .upload(filePath, fileTarget);

            if (uploadErr) throw uploadErr;

            // 2. Fetch public link URL of the newly created object
            const { data: urlData } = _supabase.storage
                .from('course-resources')
                .getPublicUrl(filePath);

            const publicResourceUrl = urlData.publicUrl;
            console.log("🔗 Shared public download asset registered:", publicResourceUrl);

            // 3. Upsert or create the Module tracking node
            let { data: targetModule, error: modErr } = await _supabase
                .from('course_modules')
                .select('id')
                .ilike('course_code', courseCode)
                .eq('title', moduleTitle)
                .maybeSingle();

            if (!targetModule) {
                const { data: newMod, error: insertModErr } = await _supabase
                    .from('course_modules')
                    .insert([{ course_code: courseCode.toLowerCase(), title: moduleTitle }])
                    .select('id')
                    .single();

                if (insertModErr) throw insertModErr;
                targetModule = newMod;
            }

            // 4. Mount lesson item tracking down to module node reference
            const { error: lessonErr } = await _supabase
                .from('course_lessons')
                .insert([{
                    module_id: targetModule.id,
                    title: lessonTitle,
                    resource_url: publicResourceUrl
                }]);

            if (lessonErr) throw lessonErr;

            alert(`✅ Published successfully! ${lessonTitle} is now instantly accessible to all enrolled students.`);
            cleanForm.reset();

        } catch (err) {
            console.error("⚡ Publication workflow structural block:", err);
            alert(`Failed to save material details: ${err.message}`);
        } finally {
            submitBtn.innerText = "🚀 Publish Material Live";
            submitBtn.disabled = false;
        }
    });
}
function loadCourseWorkspace(courseId) {
    // Show a quick content frame loading feedback state
    document.getElementById('dashboard-content-container').innerHTML = '<div class="catalog-loader">Loading workspace assets...</div>';

    // Request the fragment by attaching the specific course ID as a GET query parameter
    fetch(`/course-content.html?id=${courseId}`)
        .then(response => {
            if (!response.ok) throw new Error("Workspace data matching this ID could not be located.");
            return response.text();
        })
        .then(htmlFragment => {
            // Inject the custom classroom straight into the workspace container
            document.getElementById('dashboard-content-container').innerHTML = htmlFragment;
        })
        .catch(err => {
            console.error('Routing Error:', err);
            document.getElementById('dashboard-content-container').innerHTML = `
                <div class="empty-state-container">
                    <div class="empty-state-icon">⚠️</div>
                    <div class="empty-state-title">Failed to launch workspace</div>
                    <div class="empty-state-message">${err.message}</div>
                </div>`;
        });
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

        // ✅ FIXED: Added 'name' and 'registration_number' to the select statement so they exist!
        const { data: student, error } = await _supabase
            .from('students')
            .select('email, name, registration_number')
            .eq('registration_number', studentReg)
            .single();

        if (error || !student) return;

        // ✅ FIXED: Added safety checks (using optional chaining ?. and default fallbacks) 
        // to prevent 'undefined' crashes if a record has empty fields
        const studentName = student.name || "";
        const regNum = student.registration_number || "";

        // Grant admin access if the name contains Haron or matches your specific registration number
        if (studentName.includes("Haron") || regNum === "COM/0227/24") {
            const adminTab = document.getElementById('admin-add-course');
            if (adminTab) {
                adminTab.style.setProperty('display', 'flex', 'important');
                console.log("🔓 Admin Access Granted for Haron.");
            }
        }
    } catch (err) {
        console.error("Security verification context exception handled safely:", err);
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

            // 1. Create a container element for the card
            const cardWrapper = document.createElement('div');
            cardWrapper.className = 'course-card';
            cardWrapper.style.cssText = "background: rgba(2, 14, 46, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 1rem; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.2s ease;";

            // 2. Build the structural layout content (WITHOUT inline click attributes)
            cardWrapper.innerHTML = `
        <div class="course-image" style="position: relative; width: 100%; height: 180px; overflow: hidden;">
            <span class="year-badge" style="position: absolute; top: 12px; right: 12px; background: #f7ca44; color: #0b132b; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; z-index: 2;">
                Year 2
            </span>
            <img src="${structuralImageCover}" alt="${enrollment.course_title} Cover" style="width: 100%; height: 100%; object-fit: cover;">
        </div>
        
        <div class="course-info" style="padding: 1.25rem; flex-grow: 1; display: flex; flex-direction: column; gap: 0.5rem;">
            <span class="course-code" style="color: #f7ca44; font-size: 0.85rem; font-weight: 700;">🆔 ${enrollment.course_code}</span>
            <h3 style="margin: 0; font-size: 1.2rem; color: #ffffff; line-height: 1.4;">${enrollment.course_title}</h3>
            <div class="lecturer-info" style="display: flex; align-items: center; gap: 0.5rem; color: #94a3b8; font-size: 0.9rem; margin-top: auto; padding-top: 0.5rem;">
              <span>👨‍🏫</span>
              <span>${enrollment.lecturer_name || 'Department Faculty'}</span>
            </div>
        </div>

<div class="course-actions" style="padding: 0 1.25rem 1.25rem 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; width: 100%; box-sizing: border-box; align-items: center;">
    
    <!-- PRIMARY ACTION: Fixed to Emerald Green by default -->
    <button class="action-enter-trigger" style="width: 100% !important; background: #10b981 !important; border: none !important; color: white !important; padding: 0.8rem 1rem; border-radius: 0.6rem; cursor: pointer; font-weight: 700; font-size: 0.95rem; display: flex; align-items: center; justify-content: center; gap: 0.4rem; transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);">
        <span>🚪</span> Enter the course
    </button>
    
 <!-- DESTRUCTIVE ACTION: Fixed to Ruby Red by default -->
<button class="action-drop-trigger" style="width: 60% !important; background: #dc2626 !important; border: none !important; color: #ffffff !important; padding: 0.55rem 1rem; border-radius: 0.5rem; cursor: pointer; font-weight: 600; font-size: 0.85rem; transition: all 0.2s ease; margin-top: 0.25rem; box-shadow: 0 4px 10px rgba(220, 38, 38, 0.15); display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;">
    <!-- Inline SVG X Icon -->
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
    Unenrol me
</button>
</div>
</div>
    `;

            // 3. Programmatically hook up event listeners using actual JS references
            const cleanCode = enrollment.course_code.trim();
            cardWrapper.querySelector('.action-enter-trigger').addEventListener('click', () => {
                console.log(`🎯 Programmatic click detected for code: ${cleanCode}`);
                enterCourseWorkspace(cleanCode);
            });

            cardWrapper.querySelector('.action-drop-trigger').addEventListener('click', () => {
                cancelEnrollment(enrollment.id);
            });

            // 4. Mount it to your grid container
            gridContainer.appendChild(cardWrapper);
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
async function enterCourseWorkspace(courseCode) {
    console.log("🚀 enterCourseWorkspace reached with code:", courseCode);

    const targetCode = String(courseCode).trim();
    const mainWorkspaceContainer = document.getElementById('main-content');

    if (!mainWorkspaceContainer) {
        console.error("❌ CRITICAL: Could not find element with id='main-content'");
        return;
    }

    // 1. Fetch the course title using Supabase BEFORE loading the view
    let displayTitle = `${targetCode.toUpperCase()} Workspace`; // fallback default
    try {
        const { data: enrollmentData, error: courseErr } = await _supabase
            .from('enrollments')
            .select('course_title')
            .ilike('course_code', targetCode)
            .limit(1)
            .maybeSingle();

        if (!courseErr && enrollmentData && enrollmentData.course_title) {
            displayTitle = enrollmentData.course_title;
            console.log("✨ Found title successfully:", displayTitle);
        }
    } catch (e) {
        console.warn("Could not pre-fetch course title:", e);
    }

    // 2. Load the HTML template fragment from Django
    const requestUrl = `/course-content.html?code=${encodeURIComponent(targetCode)}`;

    try {
        const response = await fetch(requestUrl);
        if (!response.ok) throw new Error(`Server returned error code ${response.status}`);

        const htmlSnippet = await response.text();

        // Inject the HTML template
        mainWorkspaceContainer.innerHTML = htmlSnippet;

        // 3. Update the fields now that they are rendered in the DOM
        const titleDisplay = document.getElementById('workspace-title-display');
        const codeDisplay = document.getElementById('workspace-code-display');
        const descDisplay = document.getElementById('workspace-desc-display');

        if (titleDisplay) titleDisplay.innerText = displayTitle;
        if (codeDisplay) codeDisplay.innerText = targetCode.toUpperCase();
        if (descDisplay) descDisplay.innerText = 'Welcome to your digital interactive learning area.';

        // 4. Load your modules/lessons directly from here
        await loadWorkspaceModules(targetCode);

    } catch (err) {
        console.error("❌ Classroom entry breakdown:", err);
    }
}

// Separate clean helper function to load modules
async function loadWorkspaceModules(targetCode) {
    const modulesMount = document.getElementById('workspace-modules-mount');
    if (!modulesMount) return;

    try {
        const { data: modules, error: modErr } = await _supabase
            .from('course_modules')
            .select('id, title, lessons:course_lessons(id, title, resource_url)')
            .ilike('course_code', targetCode)
            .order('id', { ascending: true });

        if (modErr) throw modErr;

        if (!modules || modules.length === 0) {
            modulesMount.innerHTML = `
                <div class="empty-workspace-state" style="text-align: center; padding: 4rem 2rem; background: rgba(2, 14, 46, 0.5); border: 2px dashed rgba(255, 255, 255, 0.1); border-radius: 1rem; color: #94a3b8;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">📂</div>
                    <h3 style="color: white; margin: 0 0 0.5rem 0;">No Content Discovered</h3>
                    <p style="margin: 0;">Your lecturer hasn't compiled learning modules yet.</p>
                </div>`;
            return;
        }

        modulesMount.innerHTML = '';
        modules.forEach(module => {
            let lessonsMarkup = '';

            if (module.lessons && module.lessons.length > 0) {
                module.lessons.forEach(lesson => {
                    // Check if there is an optional uploaded resource file link
                    let downloadButtonHTML = '';
                    if (lesson.resource_url && lesson.resource_url.trim() !== '' && lesson.resource_url !== '#') {
                        downloadButtonHTML = `
                            <div style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.05);">
                                <a href="${lesson.resource_url}" target="_blank" style="display: inline-flex; align-items: center; gap: 0.5rem; color: #10b981; text-decoration: none; font-weight: 600; font-size: 0.85rem; background: rgba(16, 185, 129, 0.1); padding: 0.4rem 0.8rem; border-radius: 0.25rem; transition: background 0.2s;">
                                    📥 Download Reference Resource File
                                </a>
                            </div>
                        `;
                    }

                    // Render notes container with pre-wrap layout formatting rules
                    lessonsMarkup += `
                        <li style="background: rgba(2, 14, 46, 0.3); padding: 1.25rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.03); display: flex; flex-direction: column; gap: 0.5rem;">
                            <div style="color: #94a3b8; font-size: 0.95rem; line-height: 1.6; white-space: pre-wrap; word-break: break-word;">
                                📄 ${lesson.title}
                            </div>
                            ${downloadButtonHTML}
                        </li>`;
                });
            } else {
                lessonsMarkup = `<li style="color: #64748b; padding: 0.5rem; font-style: italic;">No reading items uploaded inside this module.</li>`;
            }

            const moduleCard = `
                <div class="module-card" style="background: #23304c; border-radius: 1rem; padding: 1.5rem; margin-bottom: 1.5rem; border: 1px solid rgba(255, 255, 255, 0.05);">
                    <h3 style="margin: 0 0 1rem 0; font-size: 1.3rem; color: #ffffff;">📦 ${module.title}</h3>
                    <ul class="lessons-list" style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 1rem;">
                        ${lessonsMarkup}
                    </ul>
                </div>`;

            modulesMount.insertAdjacentHTML('beforeend', moduleCard);
        });
    } catch (err) {
        console.error("Error loading workspace modules:", err);
    }
}


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
// Hook this up inside your script management file when initializing the lecturer tab framework
document.getElementById('lecturer-upload-form')?.addEventListener('submit', async function (e) {
    e.preventDefault();

    const submitBtn = document.getElementById('publish-content-btn');
    submitBtn.innerText = "⏳ Uploading & Publishing Materials...";
    submitBtn.disabled = true;

    const courseCode = document.getElementById('lecturer-course-select').value;
    const moduleTitle = document.getElementById('lecturer-module-title').value.trim();
    const lessonTitle = document.getElementById('lecturer-lesson-title').value.trim();
    const fileTarget = document.getElementById('lecturer-file-input').files[0];

    try {
        if (!fileTarget) throw new Error("Please specify a document resource artifact to publish.");

        // 1. Upload File to Supabase Storage Bucket
        const sanitizedFileName = `${Date.now()}_${fileTarget.name.replace(/\s+/g, '_')}`;
        const filePath = `${courseCode}/${sanitizedFileName}`;

        console.log("📡 Staging file storage handshake for:", filePath);
        const { data: uploadData, error: uploadErr } = await _supabase.storage
            .from('course-resources')
            .upload(filePath, fileTarget);

        if (uploadErr) throw uploadErr;

        // 2. Fetch public link URL of the newly created object
        const { data: urlData } = _supabase.storage
            .from('course-resources')
            .getPublicUrl(filePath);

        const publicResourceUrl = urlData.publicUrl;
        console.log("🔗 Shared public download asset registered:", publicResourceUrl);

        // 3. Upsert or create the Module tracking node
        let { data: targetModule, error: modErr } = await _supabase
            .from('course_modules')
            .select('id')
            .ilike('course_code', courseCode)
            .eq('title', moduleTitle)
            .maybeSingle();

        if (!targetModule) {
            const { data: newMod, error: insertModErr } = await _supabase
                .from('course_modules')
                .insert([{ course_code: courseCode.toLowerCase(), title: moduleTitle }])
                .select('id')
                .single();

            if (insertModErr) throw insertModErr;
            targetModule = newMod;
        }

        // 4. Mount lesson item tracking down to module node reference
        const { error: lessonErr } = await _supabase
            .from('course_lessons')
            .insert([{
                module_id: targetModule.id,
                title: lessonTitle,
                resource_url: publicResourceUrl
            }]);

        if (lessonErr) throw lessonErr;

        alert(`✅ Published successfully! ${lessonTitle} is now instantly accessible to all enrolled students.`);
        document.getElementById('lecturer-upload-form').reset();

    } catch (err) {
        console.error("⚡ Publication workflow structural block:", err);
        alert(`Failed to save material details: ${err.message}`);
    } finally {
        submitBtn.innerText = "🚀 Publish Material Live";
        submitBtn.disabled = false;
    }
});
document.addEventListener("DOMContentLoaded", () => {
    const lecturerNavLink = document.getElementById("nav-lecturer-portal");

    if (lecturerNavLink) {
        lecturerNavLink.addEventListener("click", async (e) => {
            e.preventDefault();
            console.log("🛠️ Loading Lecturer Content Management view...");

            // 1. Highlight the current active tab in the sidebar
            document.querySelectorAll(".sidebar-link").forEach(link => {
                link.style.background = "transparent";
                link.style.color = "#94a3b8";
            });
            lecturerNavLink.style.background = "rgba(255, 255, 255, 0.05)";
            lecturerNavLink.style.color = "#ffffff";

            // 2. Fetch the template fragment straight from Django
            const mainWorkspaceContainer = document.getElementById('main-content');
            if (!mainWorkspaceContainer) {
                console.error("❌ Target viewport container '#main-content' missing.");
                return;
            }

            try {
                // Ensure your Django urls.py routes this layout template path smoothly
                const response = await fetch("/lecturer-panel.html");
                if (!response.ok) throw new Error(`Server dropped connection with code ${response.status}`);

                const htmlSnippet = await response.text();

                // 3. Inject the form markup into the dashboard frame workspace
                mainWorkspaceContainer.innerHTML = htmlSnippet;
                console.log("✅ Lecturer Portal loaded successfully into DOM workspace.");

            } catch (err) {
                console.error("❌ Failed to swap layout to lecturer view:", err);
                mainWorkspaceContainer.innerHTML = `
                    <div style="text-align: center; padding: 4rem 2rem; color: #ff6b6b;">
                        <h3>⚠️ Routing Breakdown</h3>
                        <p>${err.message}</p>
                    </div>`;
            }
        });
    }
});
async function populateLecturerCoursesDropdown() {
    const selectDropdown = document.getElementById('lecturer-course-select');
    if (!selectDropdown) {
        console.error("❌ Dropdown element '#lecturer-course-select' not found in DOM.");
        return;
    }

    try {
        console.log("📡 Fetching global courses from master catalog...");

        // Pull explicitly from your master courses table
        const { data: courses, error } = await _supabase
            .from('courses')
            .select('course_code, course_name');

        if (error) {
            console.error("🚨 Supabase Database Error Details:", error);
            throw error;
        }

        const uniqueCourses = [];
        const seenCodes = new Set();

        if (courses && courses.length > 0) {
            courses.forEach(item => {
                if (item.course_code) {
                    const codeUpper = item.course_code.trim().toUpperCase();
                    if (!seenCodes.has(codeUpper)) {
                        seenCodes.add(codeUpper);
                        uniqueCourses.push({
                            code: codeUpper,
                            title: item.course_name ? item.course_name.trim() : "Unnamed Course"
                        });
                    }
                }
            });
        }

        if (uniqueCourses.length === 0) {
            selectDropdown.innerHTML = '<option value="" disabled selected>⚠️ No courses found in global catalog</option>';
            return;
        }

        // Build dynamic HTML layout options block
        let optionsHTML = '<option value="" disabled selected>-- Choose an Enrolled Syllabus --</option>';
        uniqueCourses.forEach(course => {
            optionsHTML += `<option value="${course.code}">${course.code} - ${course.title}</option>`;
        });

        selectDropdown.innerHTML = optionsHTML;
        console.log("✅ Lecturer course selection dropdown populated successfully!");

    } catch (err) {
        console.error("❌ Catch Block Caught Exception:", err);
        selectDropdown.innerHTML = '<option value="" disabled selected>❌ Error loading database courses</option>';
    }
}
// 1. Locate your form submission event listener block
const lecturerForm = document.getElementById('lecturer-upload-form');

if (lecturerForm) {
    // 2. Make SURE 'async' is right here before '(e)' 👇
    lecturerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        try {
            // Get your form values
            const courseCode = document.getElementById('lecturer-course-select').value;
            const moduleTitle = document.getElementById('lecturer-module-title').value;
            const lessonTitle = document.getElementById('lecturer-lesson-title').value; // This is your textarea notes

            // ==================== YOUR FILE UPLOAD CODE BLOCK ====================
            let publicResourceUrl = '';
            const fileInput = document.getElementById('lecturer-file-input');

            if (fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                const filePath = `resources/${fileName}`;

                console.log("📤 Uploading optional resource file...");
                const { data: uploadData, error: uploadError } = await _supabase.storage
                    .from('lesson-materials')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                const { data: urlData } = _supabase.storage
                    .from('lesson-materials')
                    .getPublicUrl(filePath);

                publicResourceUrl = urlData.publicUrl;
            } else {
                console.log("📝 No file chosen. Skipping storage upload, publishing text content only.");
                // It stays as an empty string '', which is completely fine for the database!
            }
            // =====================================================================

            console.log("Saving to database...", { courseCode, moduleTitle, lessonTitle, publicResourceUrl });

            // 3. Your existing Supabase database insertion code goes here...
            // Make sure you are passing 'publicResourceUrl' into your 'resource_url' column field!

            alert("✨ Content published successfully!");
            lecturerForm.reset(); // Clears the form inputs cleanly

        } catch (error) {
            console.error("❌ Form processing failed:", error);
            alert("Something went wrong. Check console.");
        }
    });
}
function initializeNavigationAccess() {
    // 1. Fetch the user's role saved during the sign-in redirect
    const userRole = localStorage.getItem('student_year');

    // 2. Locate the Lecturer Portal navigation choice item in the DOM sidebar
    // Tip: Add an ID or clear identifier if needed, or query by containing text
    const lecturerNavButton = document.querySelector('.nav-item[onclick*="lecturer_panel.html"]');

    if (lecturerNavButton) {
        // 3. Evaluate matching patterns. If it's NOT exactly "Lecturer", hide it!
        if (userRole === 'Lecturer') {
            lecturerNavButton.style.display = 'flex'; // Show link to verified lecturers
            console.log("🔓 Lecturer administrative menu options activated.");
        } else {
            lecturerNavButton.style.display = 'none'; // Completely hidden from Year 1, 2, 3, 4 students
            console.log("🔒 Student session active. Lecturer panel protected.");
        }
    }
}

// Invoke this function when the window finishes setting up
window.addEventListener('DOMContentLoaded', initializeNavigationAccess);