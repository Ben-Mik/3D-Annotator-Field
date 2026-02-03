# ! Expects to be build with the repo root as the working directory !

# needs trailing slash!
ARG REGISTRY=''

FROM ${REGISTRY}python:3.10-alpine AS build

COPY ./backend/requirements.build.txt .

RUN pip wheel --no-cache-dir --no-deps --wheel-dir /wheels -r requirements.build.txt

FROM ${REGISTRY}python:3.10-alpine

# create the app group and user
RUN mkdir -p /home/api && addgroup -S api && adduser -S api -G api

# create the needed directories
ENV HOME=/home/api
ENV APP_HOME=/home/api/backend
RUN mkdir $APP_HOME && \
	mkdir $APP_HOME/static && \
	mkdir $APP_HOME/media && \
	mkdir $APP_HOME/db
WORKDIR $APP_HOME

COPY --from=build /wheels ./wheels
COPY --from=build requirements.build.txt .

RUN pip install --no-cache ./wheels/*

COPY ./deployment/api/entrypoint.sh .
RUN chmod +x ./entrypoint.sh

COPY ./backend .

RUN chown -R api:api .

USER api

# Optionally set GUNICORN_TIMEOUT and GUNICORN_NUM_WORKERS env variables
ENTRYPOINT [ "/home/api/backend/entrypoint.sh" ]
