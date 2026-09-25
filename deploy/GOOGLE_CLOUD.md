# Signalam on Google Cloud Compute Engine

This runbook deploys the complete hosted stack from this repository to one
Google Cloud Compute Engine VM: Caddy (public HTTPS), the Node/Next dashboard,
the authenticated platform API, the private detector, MySQL, and the one-shot
migration. It is a controlled pilot layout, not a highly available
architecture. The browser extension runs in Chrome/Edge, not on the VM.

The dashboard keeps browser API requests on `/api/v1`. Its server-side route
proxies them over the private Docker network to the platform, preserving
session and CSRF behavior without publishing ports 3000, 8000, 8080, or 3306.

## 1. Prepare the Google Cloud project

1. Create/select a billing-enabled project, enable Compute Engine, and set a
   [billing budget and alert](https://docs.cloud.google.com/billing/docs/how-to/budgets).
2. Own a domain with `api.example.com` for the API, `app.example.com` for the
   dashboard, and the root plus `www` for redirects to the dashboard. Substitute
   your actual names everywhere below.
3. [Reserve a static external IPv4 address](https://docs.cloud.google.com/vpc/docs/reserve-static-external-ip-address)
   in your chosen region. Create an Ubuntu 24.04 LTS **x86-64** VM in that
   region/zone and [assign the reserved IP](https://docs.cloud.google.com/compute/docs/ip-addresses/configure-static-external-ip-address).
   Start with 4 vCPU, 16 GiB RAM, and at least 50 GiB of balanced persistent
   disk as an **initial sizing estimate**, then load-test and resize. The
   detector loads a large CPU model, and image builds need extra disk space.
   See Google's [Linux VM setup](https://docs.cloud.google.com/compute/docs/create-linux-vm-instance).
4. Enable [OS Login](https://docs.cloud.google.com/compute/docs/oslogin/set-up-oslogin)
   for administrator SSH access. Restrict TCP 22 to your administrator IP or
   use [IAP TCP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding)
   with its required IAM and firewall setup. Check for broad default SSH
   rules. Allow inbound TCP **80 and 443** to this VM for Caddy; do not open
   MySQL 3306, detector 8000, or platform 8080. Review the
   [VPC firewall rules](https://docs.cloud.google.com/firewall/docs/using-firewalls),
   not just the VM's local firewall: Docker-published ports can
   [bypass UFW rules](https://docs.docker.com/engine/install/ubuntu/#firewall-limitations).
5. Create `A` records for `api.example.com`, `app.example.com`, and the root
   domain pointing to the reserved VM IP. Point `www` to the same address or
   make it a CNAME of the root. Cloud DNS is optional; any authoritative DNS
   provider can host the records.
   See the [Cloud DNS record guide](https://docs.cloud.google.com/dns/docs/set-up-dns-records-domain-name).
   Wait for public DNS resolution before expecting Caddy to issue HTTPS.

Only Caddy publishes host ports in the production Compose file. Keep the VM's
boot disk and Docker volumes persistent; deleting or recreating the VM without
a backup can lose the database and Caddy certificate state.

## 2. Install Docker and clone the repository

SSH into the VM. Install Git, [Git LFS](https://docs.github.com/en/repositories/working-with-files/managing-large-files/installing-git-large-file-storage),
and Docker Engine **with the Compose plugin**
using Docker's [official Ubuntu apt-repository instructions](https://docs.docker.com/engine/install/ubuntu/)
(not the convenience script), then check:

```bash
git --version
git lfs version
sudo docker version
sudo docker compose version
```

Clone the reviewed release commit; record its full SHA for rollback and audit:

```bash
git lfs install
git clone https://github.com/Bocchi02/BantAI.git ~/signalam
cd ~/signalam
git lfs pull
git rev-parse HEAD
```

Use `sudo docker` commands throughout this guide. Membership in the `docker`
group is effectively root access and is not needed.

## 3. Confirm the frozen runtime models

After the model-bearing commit is pushed to GitHub, a Git LFS-enabled clone
can download the active binaries. If you cloned before that commit, update
and fetch them on the VM:

```bash
cd ~/signalam
git pull --ff-only
git lfs pull
git lfs ls-files
```

The detector needs the two email `.safetensors` shards and the grouped RF
`.joblib`; the URL model is shadow/non-blocking for decisions but is still
required for detector readiness. A Git LFS pointer is not a working model.
Rollback checkpoints, the deprecated V4-B RF model, training data, and
optimizer files are deliberately excluded. The verifier in step 5 checks the
email manifest hashes and the RF SHA-256 before startup. If LFS download is
blocked by repository quotas or access controls, resolve that before building
the image; do not use substitute weights.

## 4. Configure the private production environment

On the VM, in `~/signalam`:

```bash
cp .env.example .env
chmod 600 .env
```

Edit `.env` on the VM. Set `BANTAI_API_DOMAIN=api.example.com`,
`BANTAI_WEB_DOMAIN=app.example.com`, and `BANTAI_ROOT_DOMAIN=example.com`
(hostnames only), set `BANTAI_WEB_ORIGIN=https://app.example.com` (exact
dashboard origin), and
`BANTAI_EXTENSION_ORIGIN=chrome-extension://<released-extension-id>` (exact
stable extension ID). Replace **every** example password/key with an
independent high-entropy value. Keep `GEMINI_API_KEY` server-side only. Generate
`BANTAI_ENCRYPTION_KEY` as URL-safe base64 of exactly 32 random bytes, for
example:

```bash
python3 -c 'import base64,secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("="))'
```

Store this key in your approved secret store/backups: losing it makes existing
encrypted records unreadable. Restrict access to `.env`, avoid shell commands
that print all environment values, and never commit it. You may set
`BANTAI_ADMIN_EMAIL` and `BANTAI_ADMIN_PASSWORD` for first-start admin seeding;
remove those two values after the account is created and recreate `platform`
to remove the seed password from its container environment.

`BANTAI_TRUSTED_PROXY_CIDRS` must match the **actual private Docker `edge`
network**, not the example CIDR. Fill the other values first, then run:

```bash
sudo docker compose --env-file .env -p signalam config --quiet
sudo docker compose --env-file .env -p signalam up --no-start --no-deps gateway
sudo docker network inspect signalam_edge --format '{{(index .IPAM.Config 0).Subnet}}'
```

Copy the displayed subnet into `BANTAI_TRUSTED_PROXY_CIDRS` in `.env`, and run
`config --quiet` again. Only `gateway`, `web`, and `platform` should use this
edge network; they form the controlled proxy chain. Do not leave the example
value or use `0.0.0.0/0`. Keep the Compose
project name `signalam` in subsequent commands so network/volume names stay
stable. The preliminary `gateway` container above is created but **not**
started; this is solely to allocate and inspect its Docker network.

## 5. Build, verify, start

From `~/signalam` on the VM:

```bash
sudo docker compose --env-file .env -p signalam build detector migration platform web
sudo docker run --rm --mount type=bind,src="$PWD",dst=/src,readonly --workdir /src signalam-detector:1.1.0 python scripts/verify_models.py
sudo docker compose --env-file .env -p signalam up -d
sudo docker compose --env-file .env -p signalam ps --all
```

The model verifier must report PASS before `up -d`. On first boot, `db-roles`
and `migration` should exit **0**; `mysql`, `detector`, `platform`, `web`, and
`gateway` should become healthy/running. The detector can take time to load its
model. Check both public endpoints:

```bash
curl -fsS https://api.example.com/ready
curl -fsS https://app.example.com/healthz
```

Expect `status: ready` with server models ready. `/health` only reports that
the API process is alive; it does not prove the detector and database are
ready. If startup fails, inspect bounded logs (redact before sharing):

```bash
sudo docker compose --env-file .env -p signalam logs --tail=100 gateway web platform detector migration mysql
```

If admin seeding was used, remove `BANTAI_ADMIN_PASSWORD` and
`BANTAI_ADMIN_EMAIL` from `.env` after confirming login, then run:

```bash
sudo docker compose --env-file .env -p signalam up -d --no-deps --force-recreate platform
```

## 6. Connect the dashboard and extension

- Open `https://app.example.com` and confirm the landing page, privacy policy,
  and sign-in screen load. `https://example.com` and `https://www.example.com`
  should redirect to the dashboard. The web image contains only public build
  variables; Gemini, database, encryption, and model secrets stay out of it.
  The private proxy origin is fixed by Compose to `http://platform:8080` and is
  never sent to the browser.
- In a **separate extension release checkout**, run
  `python scripts/configure_remote_endpoint.py https://api.example.com/api/v1 --mode release`.
  Verify the release manifest, CSP, and configured HTTPS endpoint. Package and
  install that build; the checked-in `extension/config.js` is currently a
  development loopback configuration. The released extension ID must equal
  `BANTAI_EXTENSION_ORIGIN` in the server `.env`.
- Test a synthetic sign-in, extension pairing, opened Gmail/Outlook/Yahoo
  email, and an exact address-bar URL in Chrome or Edge. Confirm the dashboard
  loads, API calls and CSRF work, and no private ports are reachable publicly.
  Do not call browser behavior verified until this live test is performed.

## 7. Operate and update safely

Set up a tested MySQL-aware backup and restore process, a persistent copy of
the encryption key, and [disk snapshot scheduling](https://docs.cloud.google.com/compute/docs/disks/about-snapshot-schedules).
Treat snapshots as sensitive because they can contain database and model data;
a live-disk snapshot alone is not a substitute for an application-consistent
database backup. Define log retention and avoid exporting raw request or email
content. Monitor disk, memory, container health, TLS expiry, `/ready`, and
Cloud AI availability.

Before an update, record the running Git SHA, take and test a backup, and
review database migrations. Then in `~/signalam`:

```bash
git pull --ff-only
sudo docker compose --env-file .env -p signalam up -d --build
sudo docker compose --env-file .env -p signalam ps --all
curl -fsS https://api.example.com/ready
```

Confirm the migration exited 0. Do **not** use `docker compose down -v`:
that deletes named database/Caddy volumes. Reverting code after a schema
migration may be unsafe; use a migration-aware rollback plan and a tested
backup rather than assuming an image rollback is sufficient.
