from django.shortcuts import render

# Create your views here.

def login_view(request):
    """Renders the standalone entry authentication interface gateway."""
    return render(request, 'login.html')

def dashboard_view(request):
    """Renders the master dashboard application shell containing your sidebar."""
    return render(request, 'dashboard.html')

def main_fragment(request):
    """Returns the internal metrics/analytics card layout piece."""
    return render(request, 'main.html')

def courses_fragment(request):
    """Returns the live search syllabus selection catalog table piece."""
    return render(request, 'courses.html')

def enrollment_fragment(request):
    """Returns the user active-enrollment student records tracking grid piece."""
    return render(request, 'enrollment.html')

def admin_fragment(request):
    """Returns the module provisioning form deployment container piece."""
    return render(request, 'admin.html')

def course_content_fragment(request):
    """
    Returns the dynamic content page layout for a specific course 
    based on the 'code' parameter sent by the JavaScript fetch router.
    """
    # 1. Grab the course code from the request URL parameter (e.g. ?code=CS201)
    course_code = request.GET.get('code', 'UNKNOWN')
    
    # 2. Package it into the context dictionary for the template engine
    context = {
        'course_code': course_code,
        # Later, when you plug in your database/Supabase query here, you can load your modules list:
        # 'modules': fetched_modules
    }
    
    # 3. Render a lightweight partial HTML file containing your layout structure
    return render(request, 'course_workspace.html', context)