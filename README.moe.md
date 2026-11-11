# MoE Teacher Assistant: operations guide

How to run and administer the Ministry of Education deployment of LibreChat. It's written for the
admins and operators of this server. For general LibreChat documentation, see
[README.md](README.md) and [docs.librechat.ai](https://docs.librechat.ai).

Commands run on the server from the project folder unless stated otherwise. `<...>` marks a value
you supply. Never commit real values for these: `.env`, `librechat.yaml` and
`docker-compose.override.yml` are gitignored for that reason, so back them up separately
([Backup and restore](#backup-and-restore)).

## Contents

- [Access the app](#access-the-app)
- [Manage users](#manage-users)
- [Set up a new server](#set-up-a-new-server)
- [Configuration reference](#configuration-reference)
- [Apply changes](#apply-changes)
- [Backup and restore](#backup-and-restore)
- [Where data lives](#where-data-lives)
- [Troubleshooting](#troubleshooting)

## Access the app

The app listens on port `3080`, bound to the server's localhost only.

- **On the server:** open <http://localhost:3080>.
- **From another computer:** open an SSH tunnel, then open <http://localhost:3080> on that computer:

  ```sh
  ssh -L 3080:localhost:3080 <user>@<server-ip>
  ```

- **For everyone on a network:** put a reverse proxy with HTTPS in front of port `3080`, then set
  `DOMAIN_CLIENT` and `DOMAIN_SERVER` in `.env` to the public URL.

Public sign-up is off, so an admin must create each account. `/register` redirects to `/login`,
except for invite links.

## Manage users

There are two roles: `ADMIN` and `USER` (standard user). To run the `npm` commands below in the
running app, prefix them with `docker exec -it -w /app LibreChat`.

### Create a user

**In the app (recommended):**

1. Log in with an admin account.
2. Open **Settings → General**, and find **Add user** in the **Admin** section.
3. Enter a full name, email and password (at least 8 characters). Username is optional.
4. Click **Add user**, then give the person their email and password.

The account can log in straight away. It always gets the `USER` role, and each creation is recorded
in the audit log as `user.created`.

**From the terminal:**

```sh
docker exec -it -w /app LibreChat npm run create-user
```

The first account created on an empty database becomes `ADMIN`. Use this to create the first admin
on a new server, because the Add user form needs an admin to log in.

### List users

The app doesn't have a user list page yet. Use either of these commands:

```sh
# Details for each account, with the total at the end
docker exec -w /app LibreChat npm run list-users

# A compact list that includes each account's role
docker exec chat-mongodb mongo LibreChat --quiet --eval 'db.users.find({},{email:1,name:1,role:1,_id:0}).forEach(printjson)'
```

### Passwords

Passwords are stored as one-way hashes, so **nobody can view them**, including admins. If someone
forgets theirs, set a new one and give it to them:

```sh
docker exec -it -w /app LibreChat npm run reset-password
```

### Other user tasks

| Task               | Command                                                                               |
| ------------------ | ------------------------------------------------------------------------------------- |
| Create an invite   | `docker exec -it -w /app LibreChat npm run invite-user`                               |
| Ban a user         | `docker exec -it -w /app LibreChat npm run ban-user` (asks for the email and minutes) |
| Delete a user      | `docker exec -it -w /app LibreChat npm run delete-user <email>`                       |
| See usage per user | `docker exec -w /app LibreChat npm run user-stats`                                    |

Deleting a user also removes their data and can't be undone, so [back up](#backup-and-restore) first.

### Make a user an admin

The Add user form can't create admins. To promote an account, run this and then restart the app so
that no cached copy of the user is used:

```sh
docker exec chat-mongodb mongo LibreChat --quiet --eval 'db.users.updateOne({email:"<email>"},{$set:{role:"ADMIN"}})'
docker compose restart api
```

### Give all standard users an agent

Agents are private to their creator by default. This grants view access to the `USER` role, so
every current and future standard user gets the agent. They can use it and its files, but can't
edit it. Replace `<agent-name>`:

```sh
docker exec -i chat-mongodb mongo LibreChat --quiet <<'EOF'
var agent = db.agents.findOne({ name: '<agent-name>' });
var viewer = db.accessroles.findOne({ accessRoleId: 'agent_viewer' });
printjson(db.aclentries.updateOne(
  { principalType: 'role', principalId: 'USER', resourceType: 'agent', resourceId: agent._id },
  {
    $set: { principalModel: 'Role', permBits: viewer.permBits, roleId: viewer._id, grantedAt: new Date() },
    $setOnInsert: { grantedBy: agent.author, createdAt: new Date() },
  },
  { upsert: true },
));
EOF
```

To undo it, run `db.aclentries.deleteOne(...)` with the same filter (the first object in the
command above).

## Set up a new server

**You need:** Docker with Compose, Node.js (the version in `.nvmrc`), and network access from the
server to the model and embedding servers.

**1. Get the code.** Deployment-specific changes are on this branch:

```sh
git clone https://github.com/Ethernet-DIP/LibreChat.git
cd LibreChat
git checkout feat/vllm-embedding
```

**2. Create `.env`,** then generate its secrets:

```sh
cp .env.example .env
for name in CREDS_KEY JWT_SECRET JWT_REFRESH_SECRET; do
  sed -i "s|^$name=.*|$name=$(openssl rand -hex 32)|" .env
done
sed -i "s|^CREDS_IV=.*|CREDS_IV=$(openssl rand -hex 16)|" .env
sed -i "s|^MEILI_MASTER_KEY=.*|MEILI_MASTER_KEY=$(openssl rand -hex 32)|" .env
```

When moving an existing deployment, restore the old `.env` instead of generating new values.
Credentials stored in the database can't be decrypted without the original keys.

Then set the [values in the `.env` table](#env).

**3. Create `librechat.yaml`:**

```sh
cp librechat.example.yaml librechat.yaml
```

Then apply the [changes listed below](#librechatyaml).

**4. Create `docker-compose.override.yml`.** It keeps the database in a project folder and runs your
built code on top of the published image:

```yaml
services:
  api:
    volumes:
      - ./librechat.yaml:/app/librechat.yaml:ro
      - ./client/dist:/app/client/dist:ro
      - ./packages/data-provider/dist:/app/packages/data-provider/dist:ro
      - ./packages/data-schemas/dist:/app/packages/data-schemas/dist:ro
      - ./packages/api/dist:/app/packages/api/dist:ro
      - ./api/server/routes/files/files.js:/app/api/server/routes/files/files.js:ro
      - ./api/server/routes/admin/users.js:/app/api/server/routes/admin/users.js:ro
      - ./api/server/services/AuthService.js:/app/api/server/services/AuthService.js:ro
      - ./api/server/controllers/agents/request.js:/app/api/server/controllers/agents/request.js:ro
      - ./api/server/controllers/agents/resume.js:/app/api/server/controllers/agents/resume.js:ro
      - ./api/app/clients/BaseClient.js:/app/api/app/clients/BaseClient.js:ro
      - ./api/app/clients/tools/util/fileSearch.js:/app/api/app/clients/tools/util/fileSearch.js:ro
    ports: !override
      - '127.0.0.1:3080:3080'

  mongodb:
    image: mongo:4.4.18
    volumes:
      - ./data-node-mongo44:/data/db

  admin-panel:
    ports: !override
      - '127.0.0.1:3000:3000'
```

Don't change the MongoDB version or data path on a server that already has data: a different path
starts with an empty database, and a different version may not read the existing files.

**5. Build and start:**

```sh
npm ci
npm run frontend
docker compose up -d
```

**6. Create the first admin:**

```sh
docker exec -it -w /app LibreChat npm run create-user
```

**7. Check it's running:**

```sh
docker ps
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3080/health   # expect 200
```

Then log in, and [create an agent and share it](#give-all-standard-users-an-agent) with your users.

## Configuration reference

### `.env`

| Variable                                          | Value                              | Purpose                                                   |
| ------------------------------------------------- | ---------------------------------- | --------------------------------------------------------- |
| `APP_TITLE`                                       | `MoE Teacher Assistant`            | Name shown in the app                                     |
| `DOMAIN_CLIENT`, `DOMAIN_SERVER`                  | `http://localhost:3080`            | The URL people use; change it behind a proxy              |
| `ENDPOINTS`                                       | `agents,custom`                    | Which model providers are offered                         |
| `ALLOW_EMAIL_LOGIN`                               | `true`                             | Allows login with email and password                      |
| `ALLOW_REGISTRATION`                              | `false`                            | Turns off public sign-up and redirects `/register`        |
| `ALLOW_SOCIAL_LOGIN`, `ALLOW_SOCIAL_REGISTRATION` | `false`                            | Turns off Google, GitHub and similar logins               |
| `ALLOW_PASSWORD_RESET`                            | `false`                            | Turns off self-service reset, which needs email set up    |
| `ALLOW_UNVERIFIED_EMAIL_LOGIN`                    | `true`                             | Allows login with no verification email                   |
| `ALLOW_SHARED_LINKS_PUBLIC`                       | `false`                            | Requires login to open a shared chat link                 |
| `SEARCH`                                          | `false`                            | Turns off message search (Meilisearch)                    |
| `EMBEDDINGS_PROVIDER`                             | `openai`                           | File search uses an OpenAI-compatible embeddings API      |
| `EMBEDDINGS_MODEL`                                | `all-MiniLM-L6-v2`                 | The embedding model                                       |
| `RAG_OPENAI_BASEURL`                              | `http://<embeddings-host>:8001/v1` | The embeddings server                                     |
| `RAG_OPENAI_API_KEY`                              | `<key>`                            | Key for the embeddings server                             |
| `RAG_CHECK_EMBEDDING_CTX_LENGTH`                  | `false`                            | Needed for embedding servers that aren't OpenAI's         |
| `RAG_USE_FULL_CONTEXT`                            | `false`                            | Searches for relevant parts of a file, not the whole file |
| `ADMIN_PANEL_SESSION_SECRET`                      | `<random>`                         | Needed only if you use the separate admin panel           |

Changing the embedding model makes existing embeddings incompatible, so files must be embedded
again.

### `librechat.yaml`

These are the differences from `librechat.example.yaml`.

**Add the model server,** and remove the example providers you don't use (xAI, Groq and so on) from
`endpoints.custom`:

```yaml
endpoints:
  custom:
    - name: 'MoE Teacher Assistant'
      apiKey: '<api-key>'
      baseURL: 'http://<model-host>:8000/v1/'
      models:
        default: ['gpt-oss-120b', 'qwen3-coder-next', 'llama4-scout']
        fetch: false
      titleConvo: true
      titleModel: 'current_model'
      modelDisplayLabel: 'MoE Teacher Assistant'
```

The model names must match what the server provides. With `fetch: false`, only the models listed
here are offered.

**Limit Projects to admins:**

```yaml
projects:
  adminOnly: true
```

**Turn on textbooks and file search, and set the login page link:**

```yaml
interface:
  textbooks: true
  fileSearch: true
  authFooterLink:
    label: 'www.moe.gov.et'
    url: 'https://moe.gov.et/'
```

**Show only agents in the model menu:**

```yaml
modelSpecs:
  addedEndpoints:
    - agents
```

**Keep role permissions out of `interface`.** Don't add `prompts`, `bookmarks`, or `create`, `share`
and `public` under `agents`. Values set there overwrite both the `ADMIN` and `USER` roles on every
restart, so this deployment manages them per role and keeps only:

```yaml
interface:
  agents:
    use: true
```

The `USER` role currently has `AGENTS.USE` only, so standard users can use agents shared with them
but can't create or share their own.

## Apply changes

| What changed                                  | What to do                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| `librechat.yaml`                              | `docker compose restart api`                                                      |
| `.env`                                        | `docker compose up -d --force-recreate --no-deps api rag_api`                     |
| `docker-compose.override.yml`                 | `docker compose up -d --no-deps api`                                              |
| A backend file that's mounted in the override | `docker compose restart api`                                                      |
| A new backend file under `api/`               | Add a mount for it in the override, then run `docker compose up -d --no-deps api` |
| TypeScript under `packages/`, or `client/`    | `npm run frontend`, then `docker compose restart api`                             |

After pulling a new `librechat-dev` image, check that the mounted files and `dist` folders are still
compatible with it. They're built from this branch, not from the image.

Refresh the browser to load a new frontend build.

## Backup and restore

Back up regularly and keep a copy **off the server**. Don't put `data-node-mongo44` in Git: it holds
password hashes and conversations, and copying its files while MongoDB is running can give a backup
that won't restore.

### Create a backup

This creates one encrypted file and removes the unencrypted copies only if every step worked:

```sh
cd <project-folder>
export GPG_TTY=$(tty)
D=$(date +%F)
B=~/backups/librechat-$D
mkdir -p "$B"

docker exec chat-mongodb mongodump --db LibreChat --archive --gzip > "$B/mongo.archive.gz" \
&& docker exec vectordb sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$B/vectordb.sql.gz" \
&& tar czf "$B/files.tar.gz" uploads images .env librechat.yaml docker-compose.override.yml \
&& tar -C ~/backups -czf "$B.tar.gz" "librechat-$D" \
&& gpg -c --cipher-algo AES256 --pinentry-mode loopback -o "$B.tar.gz.gpg" "$B.tar.gz" \
&& gpg --pinentry-mode loopback -d "$B.tar.gz.gpg" | tar tz \
&& rm -rf "$B" "$B.tar.gz" \
&& ls -lh ~/backups
```

Keep the passphrase in a password manager. **Without it the backup can't be opened.**

### Copy it off the server

Run this on your own computer:

```sh
scp <user>@<server-ip>:~/backups/librechat-<date>.tar.gz.gpg .
```

Then upload the `.gpg` file to Google Drive or similar. Only upload the encrypted file, because the
backup contains your `.env` secrets.

### Restore a backup

Restore into a server that's been set up but has no data, and practise this before you need it:

```sh
gpg --pinentry-mode loopback -d librechat-<date>.tar.gz.gpg | tar xz
cd librechat-<date>

# Database
docker exec -i chat-mongodb mongorestore --archive --gzip < mongo.archive.gz

# File search embeddings
gunzip -c vectordb.sql.gz | docker exec -i vectordb sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'

# Uploads, images and config: this overwrites those files in the project folder
tar xzf files.tar.gz -C <project-folder>

cd <project-folder> && docker compose up -d --force-recreate api
```

## Where data lives

| Data                                      | Location                                 | Lost when                                       |
| ----------------------------------------- | ---------------------------------------- | ----------------------------------------------- |
| Users, agents, conversations, permissions | `data-node-mongo44/`                     | The folder is deleted, or `git clean -fdx` runs |
| Uploaded files                            | `uploads/`                               | The folder is deleted, or `git clean -fdx` runs |
| Message search index                      | `meili_data_v1.35.1/`                    | The folder is deleted                           |
| File search embeddings                    | Docker volume `librechat_pgdata2`        | `docker compose down -v`                        |
| App data                                  | Docker volume `librechat_librechat-data` | `docker compose down -v`                        |

Restarting, recreating or removing containers and images doesn't delete any of this.

**Avoid `docker compose down -v` and `git clean -fdx`.** Git can't bring back ignored folders.

## Troubleshooting

**Useful commands:**

```sh
docker ps                        # what's running
docker logs -f --tail 100 LibreChat   # live app logs (also in logs/)
docker compose restart api       # restart the app
```

| Symptom                                            | Cause and fix                                                                                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Add user** isn't in Settings                     | Refresh the page and check you're logged in as an admin. If it's still missing, the frontend needs building (`npm run frontend`).                                          |
| "An account with this email already exists"        | Use another email, or [reset that account's password](#passwords).                                                                                                         |
| A standard user can't see an agent                 | [Grant access to the `USER` role](#give-all-standard-users-an-agent), then have them refresh.                                                                              |
| Agents don't respond                               | Check that the server can reach the model server: `curl http://<model-host>:8000/v1/models`.                                                                               |
| File search returns nothing or fails               | Check the `rag_api` and `vectordb` containers, and that the embeddings server at `RAG_OPENAI_BASEURL` is reachable. If `pgdata2` was lost, upload the files again.         |
| `admin-panel` keeps restarting                     | `ADMIN_PANEL_SESSION_SECRET` isn't set. Set it to a random value of at least 32 characters (`openssl rand -hex 32`), or stop the panel: `docker compose stop admin-panel`. |
| `Index build failed` warnings at startup           | An older index conflicts with a newer one. See [UPGRADING.md](UPGRADING.md) for `npm run migrate:tenant-indexes`. Back up and stop the app first.                          |
| All users or agents seem to have disappeared       | The database path or project location probably changed. Check the `mongodb` mount with `docker inspect chat-mongodb` before changing anything.                             |
| `gpg: problem with the agent: Inappropriate ioctl` | Run `export GPG_TTY=$(tty)`, and use `--pinentry-mode loopback` as in the backup command.                                                                                  |
