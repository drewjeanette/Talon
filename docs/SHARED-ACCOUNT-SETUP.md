# Moving Talon to a Shared Cloudflare Account

This is the full checklist for:

- creating `admin@talontime.org`
- moving the domain, database and Worker from the owner's personal Cloudflare account to a shared one
- turning on email through Resend

Everything here works on the **Free** plan.

**Who does what**
- 🔒 **Owner only**: needs the owner's personal Cloudflare login, or the place where `talontime.org` was bought.
- 👥 **Anyone with the shared login**: can be handed to a teammate once Part 2 is done.

**Rough time:** about 2 hours of work. The switchover in Part 4 also needs a quiet window of a few hours when nobody is clocking in.

---

## Part 1: Create `admin@talontime.org` (🔒 owner, 10 min)

This address only forwards mail to an inbox you already have. It can receive but not send, which is all you need to sign up for Cloudflare and Resend.

1. Log in to your **personal** Cloudflare account and open `talontime.org`.
2. Go to **Email → Email Routing → Get started**.
3. Create the address `admin` and set the destination to your Gmail. Click the confirmation link Cloudflare emails to your Gmail.
4. When Cloudflare offers to add DNS records, click **Add records automatically**.
5. Test it: send an email to `admin@talontime.org` and check that it shows up in your Gmail.

> Tip: if more than one person should receive this mail, forward it to a Google Group instead of one person's Gmail.

## Part 2: Create the shared Cloudflare account (🔒 owner, 10 min)

1. Log out of Cloudflare, then sign up at dash.cloudflare.com with `admin@talontime.org`. Use a strong password.
2. Turn on two-factor authentication: **My Profile → Authentication**.
3. Save the password and the 2FA code in a shared password manager, such as Bitwarden or 1Password. Whoever has both of these can manage Talon.
4. Choose how teammates get in. Either share that login through the password manager, or (recommended) go to **Manage Account → Members → Invite** and invite each teammate with their own email. With individual invites, nobody has to share a password and you can remove a person later.

✅ After Part 2, everything below marked 👥 can be done by teammates.

## Part 3: Set up the new database and Worker, without switching yet (👥 anyone, 30 min)

Do this from the repo root on a computer with the project installed. The live site stays on the old account the whole time.

1. Log the command-line tool into the **shared** account:
   ```bash
   npx wrangler logout
   ```
   ```bash
   npx wrangler login
   ```
2. Create the new database. Run this from `server/`:
   ```bash
   npx wrangler d1 create talon-db
   ```
   It prints a new `database_id`. Paste it into `server/wrangler.toml` in place of the old one.
3. Also in `server/wrangler.toml`, add `account_id = "<shared account id>"` near the top. The ID is shown in the Cloudflare dashboard sidebar. This makes sure deploys always go to the shared account.
4. Create the secrets on the shared account. Run each command and paste a random value. You can make one with `openssl rand -base64 48`, or with any password generator set to 48+ characters.
   ```bash
   npx wrangler secret put JWT_ACCESS_SECRET
   ```
   ```bash
   npx wrangler secret put JWT_REFRESH_SECRET
   ```
   New values sign everyone out once after the move, which is expected.
5. Commit the `wrangler.toml` change. **Don't deploy yet.**

## Part 4: The switchover (🔒 owner + 👥 one helper, ~1 hour, during a quiet window)

Tell users ahead of time: *"Talon is down for maintenance from X to Y. Don't clock in or out."* Any data entered on the old site after step 1 would be lost.

1. 🔒 **Copy the live data.** Log the tool into the **personal** account, then from `server/` run:
   ```bash
   npx wrangler d1 export talon-db --remote --output=../../talon-backup.sql
   ```
   The file contains employee data and password hashes. Keep it **outside** the repo, never commit it, and delete it when you're done.
2. 🔒 **Save the DNS records.** In the personal account, go to `talontime.org` → **DNS → Records → Import and Export → Export**. That downloads a list of every record, including the email records.
3. 👥 **Load the data into the new database.** Log the tool into the **shared** account, then from `server/` run:
   ```bash
   npx wrangler d1 execute talon-db --remote --file=../../talon-backup.sql
   ```
   Then confirm the copy is complete. It should say there are no migrations to apply:
   ```bash
   npx wrangler d1 migrations list talon-db --remote
   ```
4. 👥 **Deploy to the shared account** from the repo root:
   ```bash
   npm run deploy
   ```
   The site is now live at a temporary `talon-api.<something>.workers.dev` address. Open it and sign in with a real account to check that the data is there.
5. 🔒 **Move the domain.** This depends on where `talontime.org` was bought:
   - **Somewhere else (Namecheap, GoDaddy, Porkbun, ...):**
     1. In the shared account, click **Add a domain**, enter `talontime.org` and pick the **Free** plan.
     2. Import the DNS file from step 2, and remove any record that pointed at the old Worker.
     3. Cloudflare shows two nameservers. At the registrar, replace the old nameservers with these.
     4. Wait until the domain shows **Active** in the shared account. That's usually under an hour, at most 24.
   - **At Cloudflare (Cloudflare Registrar):** moving a registered domain between Cloudflare accounts goes through Cloudflare's "move domain" steps or support. Search the Cloudflare docs for *"move a domain between Cloudflare accounts"* and follow the current steps.
6. 👥 **Connect the domain to the Worker.** In the shared account, go to **Workers & Pages → talon-api → Settings → Domains & Routes → Add → Custom domain** and enter `talontime.org`.
7. 👥 **Test** `https://talontime.org`: sign in, clock in and out with a test account, and open Settings.
8. 🔒 **Turn off the old site.** In the personal account, delete the `talontime.org` domain, then the old `talon-api` Worker.
   - Keep the old `talon-db` database for **one week** as a backup, then delete it.
   - Delete `talon-backup.sql` from your computer.

## Part 5: Email forwarding in the shared account (👥 anyone, 5 min)

The DNS file copies the email records, but not the forwarding rules. Set them up again:

1. In the shared account, go to `talontime.org` → **Email → Email Routing**.
2. Re-add `admin@talontime.org` with your Gmail (or the Google Group) as the destination, and confirm the email Cloudflare sends.
3. Test it by sending an email to `admin@talontime.org`.

> Do this soon after Part 4. The shared Cloudflare login depends on this address receiving email, for example for password resets.

## Part 6: Resend, so password reset emails actually send (👥 anyone, 20 min)

1. Sign up at **resend.com** with `admin@talontime.org`.
2. Go to **Domains → Add Domain**, enter `talontime.org` and pick region `us-east-1`.
3. Resend lists about three DNS records: an MX and a TXT on `send`, and a TXT on `resend._domainkey`. Add each one in the shared Cloudflare account under **DNS → Records → Add record**, copying the type, name and value exactly. If Resend offers to set them up in Cloudflare automatically, use that instead.
4. Also add a TXT record named `_dmarc` with the value `v=DMARC1; p=none;`.
5. Back in Resend, click **Verify** and wait for **Verified**. That's usually minutes, at most a few hours.
6. Go to **API Keys → Create**, set permission to **Sending access** and domain to `talontime.org`. Copy the key; it's shown only once.
7. From `server/`, logged into the **shared** account, run this and paste the key:
   ```bash
   npx wrangler secret put RESEND_API_KEY
   ```
   It works immediately; no redeploy is needed.
8. Test it: go to `https://talontime.org/forgot-password`, enter your own account's email, and check that the reset email arrives. **Resend → Emails** shows each message's delivery status.
9. Invite teammates to Resend under **Team**, if they need it.

## Part 7: Make sure TN Tech accepts the emails (👥 anyone)

Ask TTU IT, or the help desk, to allowlist the sending domain `talontime.org` (or `send.talontime.org`). Every Talon user has an `@tntech.edu` address, and campus filters may otherwise quarantine mail from a new domain.

## Part 8: Tell the team (👥 anyone)

After pulling the `wrangler.toml` change, each developer runs:

```bash
npx wrangler login
```
Log in with the shared account, or with your own invited account.

```bash
npm install
```
```bash
npm run db:migrate:local
```
```bash
npm run db:seed:local
```

The local database is tied to the database ID, so it starts empty after the change. That's why the migrate and seed steps are needed.

---

## Quick reference: who can do what after the move

| Task | Who |
|---|---|
| Part 1, Part 2, Part 4 steps 1, 2, 5 and 8 | 🔒 Owner (personal account or the registrar) |
| Deploying, database migrations, secrets | 👥 Anyone in the shared account |
| DNS records, email forwarding, Resend | 👥 Anyone in the shared account (and on Resend) |
| Inviting or removing teammates | 👥 Shared account Super Administrator |
| Watching for errors: **Workers & Pages → talon-api → Metrics** | 👥 Anyone |

Free plan reminder: if users ever see **"Error 1102"** when signing in, password hashing went over the Free plan's CPU limit. See [DEPLOYMENT.md](DEPLOYMENT.md#password-login-requires-workers-paid).
