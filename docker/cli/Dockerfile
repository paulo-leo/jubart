ARG NODE_VERSION=24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9
ARG DOCKER_CLI_IMAGE=docker:cli@sha256:2357639ad1ea7d0194134bf3292622fd4e562483966ed674e5d7c945b5f3b28d
FROM ${DOCKER_CLI_IMAGE} AS dockercli
FROM node:${NODE_VERSION}
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates tzdata iproute2 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins
WORKDIR /usr/local/lib/jubart/docker/panel
COPY docker/panel/package.json docker/panel/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY docker/panel/*.mjs ./
COPY docker/panel/public/http-methods.js docker/panel/public/password-policy.js ./public/
COPY scripts/jubart*.py scripts/install-wizard.py scripts/cli-logo.json /usr/local/lib/jubart/scripts/
ENV PYTHONDONTWRITEBYTECODE=1
LABEL org.opencontainers.image.title="Jubart CLI" org.opencontainers.image.source="https://github.com/paulo-leo/jubart"
CMD ["python3", "/usr/local/lib/jubart/scripts/jubart.py"]
