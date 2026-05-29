from django.urls import path

from . import views

# All routes are mounted under /api/v1/ by the project's root urls.py.
urlpatterns = [
    path(
        "projects/<int:pk>/dbLinkConfig/",
        views.DbLinkProjectViewSet.as_view(
            {"get": "config", "put": "config_update"}
        ),
        name="dblink-config",
    ),
    path(
        "projects/<int:pk>/dbLinkValues/",
        views.DbLinkProjectViewSet.as_view({"get": "values"}),
        name="dblink-values",
    ),
    path(
        "modelData/<int:pk>/dbLinkFile",
        views.DbLinkFileViewSet.as_view(
            {"put": "upload", "get": "download"}
        ),
        name="dblinkfile",
    ),
]
