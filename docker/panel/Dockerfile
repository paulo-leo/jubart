ARG NODE_VERSION=24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9
ARG DOCKER_CLI_IMAGE=docker:cli@sha256:2357639ad1ea7d0194134bf3292622fd4e562483966ed674e5d7c945b5f3b28d
FROM ${DOCKER_CLI_IMAGE} AS dockercli
FROM node:${NODE_VERSION} AS panel-build
WORKDIR /opt/panel
COPY package.json package-lock.json build.mjs ./
RUN npm ci --ignore-scripts
RUN mkdir -p /opt/runtime && cp package.json package-lock.json /opt/runtime/ && cd /opt/runtime && npm ci --omit=dev --ignore-scripts
COPY frontend ./frontend
COPY public ./public
RUN npm run build
FROM node:${NODE_VERSION}
# Buildx autentica no registro a partir do painel, usando os certificados locais.
COPY --from=dockercli /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx
WORKDIR /opt/panel
COPY --from=panel-build /opt/runtime/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY *.mjs ./
COPY public ./public
COPY --from=panel-build /opt/panel/public/react-app.js /opt/panel/public/react-app.js.LEGAL.txt /opt/panel/public/react-app.css /opt/panel/public/react-app.css.LEGAL.txt ./public/
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "/opt/panel/server.mjs"]
