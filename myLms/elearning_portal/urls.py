from django.urls import path
from . import views

urlpatterns = [
    path('', views.login_view, name='login'),
    path('dashboard.html', views.dashboard_view, name='dashboard'),
    path('main.html', views.main_fragment, name='fragment_main'),
    path('courses.html', views.courses_fragment, name='fragment_courses'),
    path('enrollment.html', views.enrollment_fragment, name='fragment_enrollment'),
    path('admin.html', views.admin_fragment, name='fragment_admin'),
    path('course-content.html', views.course_content_fragment, name='course_content_fragment'),
    path('lecturer_panel.html', views.lecturer_panel_view, name='lecturer_panel'),
]