from django.db import models

from annotator.backend.models import File, ModelData, Project


DBLINK_URL_MAX_LENGTH = 2048


class DbLinkProjectConfig(models.Model):
    """
    Per-project DB-link configuration. Owner-only on update (enforced at
    the view layer). All three URL fields are optional — empty string means
    the corresponding feature (Add new, click-to-open) is disabled.
    """

    project = models.OneToOneField(
        Project,
        on_delete=models.CASCADE,
        related_name="db_link_config",
    )
    webclientUrl = models.CharField(
        max_length=DBLINK_URL_MAX_LENGTH, blank=True, default=""
    )
    lookupUrlTemplate = models.CharField(
        max_length=DBLINK_URL_MAX_LENGTH, blank=True, default=""
    )
    createNewUrlTemplate = models.CharField(
        max_length=DBLINK_URL_MAX_LENGTH, blank=True, default=""
    )


class DbLinkPointsFile(models.Model):
    """
    Per-model JSON file holding the DB-link points for that model. Mirrors
    the existing baseFile / annotationFile pattern but isolated to the
    dblink app.
    """

    modelData = models.OneToOneField(
        ModelData,
        on_delete=models.CASCADE,
        related_name="db_link_points_file",
    )
    file = models.OneToOneField(
        File,
        blank=True,
        null=True,
        # files do not have a backwards relation
        related_name="+",
        on_delete=models.SET_NULL,
    )
