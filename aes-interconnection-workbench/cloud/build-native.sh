#!/bin/sh
set -eu
# Only the bootstrap is public; the application comes from the verified private archive.
python aes-interconnection-workbench/cloud/fetch-source.py \
  --secret-file /etc/secrets/source_archive_url --destination .cloud-source
cd .cloud-source
python -m pip install --no-cache-dir -r requirements.lock
cd frontend
npm ci
npm run build
