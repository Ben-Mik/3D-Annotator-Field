from django.apps import AppConfig


class DbLinkConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "annotator.dblink"
    label = "dblink"
