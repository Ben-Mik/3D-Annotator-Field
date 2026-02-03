# ! Expects to be build with the repo root as the working directory !

# needs trailing slash!
ARG REGISTRY=''


FROM ${REGISTRY}node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g corepack@latest
RUN corepack enable

# build react project
FROM base AS build

WORKDIR /app


COPY ./frontend/package.json .
COPY ./frontend/pnpm-lock.yaml .

RUN corepack install
RUN pnpm install --ignore-scripts --frozen-lockfile

COPY ./frontend .

ARG API_BASE=not_set
ENV ANNOTATOR_3D_API_BASE_URL=${API_BASE}

ARG TITLE=not_set
ENV ANNOTATOR_3D_TITLE=${TITLE}

ARG DEBUG=false
ENV ANNOTATOR_3D_DEBUG=${DEBUG}

ARG LOGGING_LEVEL=0
ENV ANNOTATOR_3D_LOGGING_LEVEL=${LOGGING_LEVEL}

ARG BACKEND_VERSION=not_set
ARG BACKEND_VERSION_SHA=not_set
ARG FRONTEND_VERSION=not_set
ARG FRONTEND_VERSION_SHA=not_set
ARG SERVER_VERSION=not_set
ARG SERVER_VERSION_SHA=not_set
ENV ANNOTATOR_3D_BACKEND_VERSION=${BACKEND_VERSION}
ENV ANNOTATOR_3D_BACKEND_VERSION_SHA=${BACKEND_VERSION_SHA}
ENV ANNOTATOR_3D_FRONTEND_VERSION=${FRONTEND_VERSION}
ENV ANNOTATOR_3D_FRONTEND_VERSION_SHA=${FRONTEND_VERSION_SHA}
ENV ANNOTATOR_3D_SERVER_VERSION=${SERVER_VERSION}
ENV ANNOTATOR_3D_SERVER_VERSION_SHA=${SERVER_VERSION_SHA}

RUN pnpm build


FROM ${REGISTRY}nginx:1.28.0-alpine

COPY --from=build /app/build /home/frontend

# delete default config
RUN rm /etc/nginx/conf.d/default.conf
COPY ./deployment/static/nginx.conf /etc/nginx/conf.d

CMD ["nginx", "-g", "daemon off;"]
