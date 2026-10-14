# Private application cloud bootstrap

This directory contains only the deployment wrapper. The application source remains in its private repository; no database credentials or download secrets belong in this public repository.

Render builds this Dockerfile using a secret file named `source_archive_url` containing a fresh GitHub private archive download URL, and `SOURCE_ARCHIVE_SHA256` containing the expected archive checksum. The secret is mounted only for the source download and is not copied into the final image. The application is baked into Render's private image and does not download source when it starts.

The same wrapper also supports a Free native Python service. Set the build command to `sh aes-interconnection-workbench/cloud/build-native.sh` and the start command to `cd .cloud-source && sh scripts/cloud-start.sh`. The downloader reads `/etc/secrets/source_archive_url`, checks the source hash, and extracts the original private application before installing its locked dependencies and building the frontend. Use Python 3.13.12 and Node 22.22.0.

Use one worker, `/api/health`, secure cookies, and a privately configured Neon PostgreSQL URL. Disable automatic deploys: GitHub archive URLs expire after five minutes. For code updates, supply a fresh archive URL and matching checksum, then deploy manually. Ordinary restarts reuse the successful build artifact and the existing cloud database. This wrapper does not imply that a deployment is live; verify the actual service before sharing its URL.
