import json
from typing import Optional, Type, List, Any, TYPE_CHECKING

from django.http import FileResponse

from rest_framework import status, exceptions
from rest_framework.decorators import action
from rest_framework.generics import get_object_or_404
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated, BasePermission
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import BaseSerializer
from rest_framework.viewsets import GenericViewSet

from annotator.backend import models as backend_models
from annotator.backend import permissions
from annotator.backend.serializers import FileUploadSerializer
from annotator.backend.utils import (
    check_modeldata_lock,
    get_modeldata_file_path,
)

from . import models as dblink_models
from . import serializers as dblink_serializers


if TYPE_CHECKING:
    DbLinkProjectViewSetBase = GenericViewSet[backend_models.Project]
    DbLinkFileViewSetBase = GenericViewSet[backend_models.ModelData]
else:
    DbLinkProjectViewSetBase = GenericViewSet
    DbLinkFileViewSetBase = GenericViewSet


def _get_permissions(
    view: GenericViewSet,
    table: dict[str, List[Type[BasePermission]]],
) -> List[BasePermission]:
    try:
        return [perm() for perm in table[view.action]]
    except KeyError:  # pragma: no cover
        return [perm() for perm in view.permission_classes]


class DbLinkProjectViewSet(DbLinkProjectViewSetBase):
    """
    Project-scoped DB-link endpoints:
      GET /projects/<pk>/dbLinkConfig/   — read config (any project member)
      PUT /projects/<pk>/dbLinkConfig/   — update config (owner only)
      GET /projects/<pk>/dbLinkValues/   — distinct values across the project
    """

    queryset = backend_models.Project.objects.all()
    permission_classes_by_action: dict[str, List[Type[BasePermission]]] = {
        "config": [IsAuthenticated, permissions.IsPartOfProject],
        "config_update": [IsAuthenticated, permissions.IsProjectOwner],
        "values": [IsAuthenticated, permissions.IsPartOfProject],
    }

    @action(detail=True, methods=["get"], url_path="dbLinkConfig")
    def config(self, request: Request, pk: Optional[str] = None) -> Response:
        project: backend_models.Project = self.get_object()
        config = getattr(project, "db_link_config", None)
        if config is None:
            return Response(
                {
                    "webclientUrl": "",
                    "lookupUrlTemplate": "",
                    "createNewUrlTemplate": "",
                }
            )
        serializer = dblink_serializers.DbLinkProjectConfigSerializer(config)
        return Response(serializer.data)

    @config.mapping.put
    def config_update(
        self, request: Request, pk: Optional[str] = None
    ) -> Response:
        project: backend_models.Project = self.get_object()
        config = getattr(project, "db_link_config", None)
        if config is None:
            serializer = dblink_serializers.DbLinkProjectConfigSerializer(
                data=request.data
            )
            serializer.is_valid(raise_exception=True)
            serializer.save(project=project)
        else:
            serializer = dblink_serializers.DbLinkProjectConfigSerializer(
                config, data=request.data, partial=True
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="dbLinkValues")
    def values(self, request: Request, pk: Optional[str] = None) -> Response:
        project: backend_models.Project = self.get_object()
        values: set[str] = set()
        # Iterate via the reverse OneToOne — each modelData has at most one
        # db_link_points_file. Skip if no file or unparseable.
        for modeldata in project.modelData.all():
            points_file = getattr(modeldata, "db_link_points_file", None)
            if points_file is None or points_file.file is None:
                continue
            try:
                with points_file.file.file.open("rb") as handler:
                    points = json.load(handler)
            except (FileNotFoundError, json.JSONDecodeError):
                continue
            if not isinstance(points, list):
                continue
            for point in points:
                value = point.get("value") if isinstance(point, dict) else None
                if isinstance(value, str) and value:
                    values.add(value)
        return Response(sorted(values))

    def get_permissions(self) -> List[BasePermission]:
        return _get_permissions(self, self.permission_classes_by_action)


class DbLinkFileViewSet(DbLinkFileViewSetBase):
    """
    Per-model DB-link points file:
      GET /modelData/<pk>/dbLinkFile  — download JSON
      PUT /modelData/<pk>/dbLinkFile  — upload/replace JSON
    """

    queryset = backend_models.ModelData.objects.all()
    serializer_class: Type[BaseSerializer[Any]] = FileUploadSerializer
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsAuthenticated, permissions.IsPartOfProject]

    @action(detail=False, methods=["get"])
    def download(
        self, request: Request, pk: Optional[str] = None
    ) -> FileResponse:
        modeldata: backend_models.ModelData = self.get_object()
        points_file = getattr(modeldata, "db_link_points_file", None)
        if points_file is None or points_file.file is None:
            raise exceptions.NotFound("DbLinkFile was not found.")
        try:
            file_handler = points_file.file.file.open()
            response = FileResponse(file_handler, filename="dbLinkFile.json")
            response.headers["Content-Length"] = file_handler.size
            return response
        except FileNotFoundError:
            raise exceptions.NotFound("DbLinkFile was not found.")

    @action(detail=False, methods=["put"])
    def upload(self, request: Request, pk: Optional[str] = None) -> Response:
        modeldata: backend_models.ModelData = self.get_object()
        check_modeldata_lock(self, modeldata, request.user)

        points_file = getattr(modeldata, "db_link_points_file", None)

        if points_file is not None and points_file.file is not None:
            serializer = dblink_serializers.DbLinkFileUploadSerializer(
                points_file.file, data=request.data
            )
            serializer.is_valid(raise_exception=True)
            serializer.save(uploaded_by=request.user)
        else:
            serializer = dblink_serializers.DbLinkFileUploadSerializer(
                data=request.data
            )
            serializer.is_valid(raise_exception=True)
            project = modeldata.project
            file = serializer.save(
                filePath=get_modeldata_file_path(modeldata, project),
                uploaded_by=request.user,
            )
            if points_file is None:
                points_file = dblink_models.DbLinkPointsFile.objects.create(
                    modelData=modeldata, file=file
                )
            else:
                points_file.file = file
                points_file.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
