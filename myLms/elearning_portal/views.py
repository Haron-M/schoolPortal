from django.shortcuts import render

# Create your views here.
from django.shortcuts import render

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