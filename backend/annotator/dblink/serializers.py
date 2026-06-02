from typing import Any

from django.core.files.uploadedfile import UploadedFile
from rest_framework import serializers

from annotator.backend import constants
from annotator.backend.serializers import FileUploadSerializer

from . import models as dblink_models


class DbLinkProjectConfigSerializer(serializers.Serializer):
    """
    Read/write serializer for the per-project DB-link configuration.
    All three fields are optional; missing means "leave unchanged" on PUT,
    empty string means "feature disabled" on the client side.
    """

    webclientUrl = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=dblink_models.DBLINK_URL_MAX_LENGTH,
    )
    lookupUrlTemplate = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=dblink_models.DBLINK_URL_MAX_LENGTH,
    )
    createNewUrlTemplate = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=dblink_models.DBLINK_URL_MAX_LENGTH,
    )

    def create(
        self, validated_data: dict[str, Any]
    ) -> dblink_models.DbLinkProjectConfig:
        instance = dblink_models.DbLinkProjectConfig(**validated_data)
        instance.save()
        return instance

    def update(
        self,
        instance: dblink_models.DbLinkProjectConfig,
        validated_data: dict[str, Any],
    ) -> dblink_models.DbLinkProjectConfig:
        instance.webclientUrl = validated_data.get(
            "webclientUrl", instance.webclientUrl
        )
        instance.lookupUrlTemplate = validated_data.get(
            "lookupUrlTemplate", instance.lookupUrlTemplate
        )
        instance.createNewUrlTemplate = validated_data.get(
            "createNewUrlTemplate", instance.createNewUrlTemplate
        )
        instance.save()
        return instance


class DbLinkFileUploadSerializer(FileUploadSerializer):
    """
    Validates the uploaded JSON file. Mirrors AnnotationFileUploadSerializer's
    pattern but expects `dbLinkFile.json` rather than a zip.
    """

    def validate_file(self, value: UploadedFile) -> UploadedFile:
        if value.size is None:
            raise Exception("File error. File size should not be none!")
        if value.size >= constants.FILE_MAX_FILESIZE:
            raise serializers.ValidationError(
                "DbLinkFile is too large.", code="too_large"
            )
        if value.name != "dbLinkFile.json":
            raise serializers.ValidationError(
                "DbLinkFile has to be named 'dbLinkFile.json'.",
                code="wrong_name",
            )
        return value
