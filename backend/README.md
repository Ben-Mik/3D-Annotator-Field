# 3D-Annotator backend

## Backend Development Setup

Please make sure you have python 3.10 installed by running `python --version`.

It is highly recommended to use a virtual environment (e.g. venv).

-   **creating a virtual environment**

    `python -m venv .venv`

-   **activating the virtual environment**

    `source ./.venv/bin/activate` (on mac/linux)

    `source ./.venv/Scripts/activate` (on windows)

-   **installing the required packages**

    `pip install -r requirements.txt`

-   **installing git hooks**

    `pre-commit install`

-   **setting up the database**

    `python manage.py makemigrations`\
    `python manage.py migrate`

    These commands should be executed after each change to the model!

-   **creating sample data**

    `echo "import annotator.backend.sample_data.initializeSampleData" | python manage.py shell`

    The sample data may be configured in `annotator/backend/sample_data/sampleData.py`.

-   **starting the development server**

	`export DJANGO_DEBUG=true`
    `python manage.py runserver`

    This starts a lightweight development web server on `127.0.0.1:8000`. For options and further information please refer to the [Django documentation](https://docs.djangoproject.com/en/4.0/ref/django-admin/#runserver).
	You may use the little `run-dev.sh` helper script for convenience to activate the virtual environment, export the environment variable and start the dev server.

## Environment Variables

List of all environment variables that may be set and their default values. Are values are strings, but some are converted to int or float.

- DJANGO_DEBUG (`true` or `false`, default: `false`, [see](https://docs.djangoproject.com/en/5.2/ref/settings/#debug))
- DJANGO_SECRET_KEY (`string`, default: `django-insecure-...`, [see](https://docs.djangoproject.com/en/5.2/ref/settings/#secret-key))
- DJANGO_USE_SSL (`true` or `false`, default: `false`, sets [csrf-cookie-secure](https://docs.djangoproject.com/en/5.2/ref/settings/#csrf-cookie-secure) and [session-cookie-secure](https://docs.djangoproject.com/en/5.2/ref/settings/#session-cookie-secure))
- DJANGO_ALLOWED_HOSTS (comma separated `string`, default: `''`, [see](https://docs.djangoproject.com/en/5.2/ref/settings/#allowed-hosts))
- DJANGO_TRUSTED_ORIGINS (comma separated `string`, default: `''`, [see](https://docs.djangoproject.com/en/5.2/ref/settings/#csrf-trusted-origins))
- DJANGO_TOKEN_LIMIT_PER_USER (`int`, default: `1`, number of valid tokens per user)
- ANNOTATOR_BACKEND_MAX_FILE_SIZE (`float`, default: `1`, max upload file size in GiB)
