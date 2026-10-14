# syntax=docker/dockerfile:1
FROM python:3.13-slim-bookworm@sha256:a1165e272e578941b84abc79e4ab38a0305cd12803a5c4247979ac7655f4d641 AS source
COPY aes-interconnection-workbench/cloud/fetch-source.py /fetch-source.py
ARG SOURCE_ARCHIVE_SHA256
RUN --mount=type=secret,id=source_archive_url,required=true python /fetch-source.py

FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS frontend-build
WORKDIR /build/frontend
COPY --from=source /source/frontend/package.json /source/frontend/package-lock.json ./
RUN npm ci
COPY --from=source /source/frontend/ ./
RUN npm run build

FROM python:3.13-slim-bookworm@sha256:a1165e272e578941b84abc79e4ab38a0305cd12803a5c4247979ac7655f4d641 AS python-build
WORKDIR /build
COPY --from=source /source/requirements.lock ./
RUN python -m pip install --no-cache-dir --prefix=/install -r requirements.lock

FROM python:3.13-slim-bookworm@sha256:a1165e272e578941b84abc79e4ab38a0305cd12803a5c4247979ac7655f4d641 AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000
WORKDIR /app
RUN groupadd --gid 10001 aes && useradd --uid 10001 --gid aes --no-create-home aes
COPY --from=python-build /install/ /usr/local/
COPY --from=source --chown=aes:aes /source/backend/ ./backend/
COPY --from=frontend-build --chown=aes:aes /build/frontend/dist/ ./frontend/dist/
COPY --from=source --chown=aes:aes --chmod=755 /source/scripts/cloud-start.sh ./scripts/cloud-start.sh
USER aes
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/api/health', timeout=4)" || exit 1
ENTRYPOINT ["/app/scripts/cloud-start.sh"]
