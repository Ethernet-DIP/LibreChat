# Automatic deploy

Merging a PR into `main` runs `.github/workflows/moe-deploy.yml`:

1. **build** (GitHub-hosted): `npm ci` and `npm run frontend`. PRs run only this job.
2. **deploy** (self-hosted runner on the server), only on a push to `main` after the build passed:
   updates the server's clone to the merged commit, rebuilds the image from it and restarts
   the stack, then waits for `/health`.

## One-time server setup

1. Clone the repo where the app will live (default `/opt/librechat`) and put the files git
   ignores there: `.env` (set `UID`, `GID`, `PORT`, `MONGO_URI` for the compose Mongo, secrets) and `librechat.yaml`.
   Data folders (`data-node`, `uploads`, `images`, `logs`) are created by compose and survive deploys.
2. Install Docker with the compose plugin; run the app once by hand to confirm it starts:
   `docker compose -f docker-compose.yml -f deploy/docker-compose.moe.yml up -d --build`
3. Add the runner: repo **Settings → Actions → Runners → New self-hosted runner**, follow the
   Linux steps, and give it the label `moe-deploy`. Install it as a service (`sudo ./svc.sh install && sudo ./svc.sh start`).
   The runner's user must be in the `docker` group and able to `git fetch` the repo
   (use a read-only deploy key or the same SSH access the clone was made with).
4. If the clone is not at `/opt/librechat`, set the repository variable `DEPLOY_DIR`.
5. Protect `main`: **Settings → Branches**, require the `build` check and a PR before merging,
   so only built code reaches the deploy step.

Secrets stay on the server in `.env`; nothing sensitive is stored in GitHub.
Roll back by re-running the workflow on an older commit, or `git reset --hard <sha>` in the
deploy folder and re-running the compose command.
