from typing import Any, cast

from rest_framework.views import exception_handler
from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.exceptions import APIException

from django.http import Http404
from django.core.exceptions import PermissionDenied


def code_exception_handler(
    exc: Exception | APIException, context: dict[str, Any]
) -> Response | None:
    print(f"exception: {exc}")
    response = exception_handler(exc, context)

    if response is None:
        return None

    print(f"response: {response.data}")

    # convert django exceptions to rest framework exceptions
    api_exc: APIException
    if isinstance(exc, Http404):
        api_exc = exceptions.NotFound(detail=str(exc))
    elif isinstance(exc, PermissionDenied):
        api_exc = exceptions.PermissionDenied(detail=str(exc))
    elif isinstance(exc, APIException):
        api_exc = exc
    else:
        # Unexpected exception type - should not reach here if response is not None
        return response

    new_data: dict[str, Any] = {}
    if isinstance(api_exc.detail, (list, dict)):
        new_data["containsErrorList"] = True
        new_data["errors"] = api_exc.get_full_details()

        if isinstance(api_exc, exceptions.ValidationError):
            new_data[
                "message"
            ] = "Some fields contain invalid values. See 'errors' for more info."
            new_data["code"] = "validation_errors"
        else:
            new_data["message"] = "This exception contains a list of errors."
            new_data["code"] = "error_list"

    else:
        new_data = cast(dict[str, Any], api_exc.get_full_details())
        new_data["containsErrorList"] = False

    response.data = new_data

    return response
