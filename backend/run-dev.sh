#!/bin/sh

source .venv/Scripts/activate

export DJANGO_DEBUG=true
export DJANGO_TOKEN_LIMIT_PER_USER=0

python manage.py runserver
