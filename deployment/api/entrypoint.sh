#!/bin/sh

python manage.py collectstatic --noinput

python manage.py migrate --noinput

python manage.py createsuperuser --noinput

gunicorn annotator.wsgi:application --bind 0.0.0.0:8000 --timeout "${GUNICORN_TIMEOUT:=1800}" --workers "${GUNICORN_NUM_WORKERS:=1}"

exec "$@"
