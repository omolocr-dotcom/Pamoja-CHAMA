# PAMOJA web app (version with no folders)

Every file sits at the top level of the repository, so nothing can be lost when uploading from a phone or file by file.

The website and phone app for PAMOJA chama groups (women groups, youth groups, table banking).
This repository holds **only the web pages**. The server (database, SMS, M-Pesa Paybill, scoring) is a separate package and is never uploaded to GitHub.

## What is in this folder

| File or folder | What it is |
|---|---|
| `server.js`, `package.json`, `Dockerfile` | Start-up files for hosts that run an app (Chajio). Not part of the website itself. |
| `index.html` | Home page. Has the "Open the app" button and a small developer link. |
| `client.html` | The member and leader app (Home, Money, Loans, More). |
| `developer.html` | The **app developer console**. A separate page: members never load it. |
| `shared.html` | The page a sponsor opens from the secure link you send them. |
| `style.css` | Colours, spacing and layout (light and dark mode). |
| `config.js` | **The one file you edit.** Server address and Paybill number. |
| `common.js` | Shared helpers (sign-in, safe text, buttons). |
| `client.js` | Logic for the member and leader app. |
| `developer.js` | Logic for the developer console. |
| `shared.js` | Logic for the sponsor page. |
| `pwa.js`, `sw.js`, `manifest.json` | Install on the phone home screen and open offline. |
| `logo.png`, `logo-96.png`, `icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`, `favicon-32.png` | The PAMOJA logo and the app icons made from it. |

## Set up (5 minutes)

1. Open `config.js`.
2. If the web pages and the server share one address, leave `API_BASE` empty.
   If the pages are on GitHub Pages and the server is on your own VM, set `API_BASE` to the server address, for example `'https://api.pamoja.example.co.ke'`, and put the web address in the server's `CORS_ORIGIN` setting.
3. Put the real Paybill number in `PAYBILL_NUMBER`.
4. Upload the folder to GitHub. Pages is served from the folder root, so `index.html` is the home page.

## Hosting on Chajio (or any host that runs an app)

Some hosts do not just copy files: they start a small program and keep asking it "are you healthy?". If it never answers, they report **"App is not healthy"**. That is why this folder includes a tiny server:

- `server.js` hands out the website files. It needs **nothing installed** (no packages).
- `package.json` tells the host how to start it: **`npm start`** (which runs `node server.js`).
- It listens on the port the host gives it in the **`PORT`** setting (3000 if none), and answers the health check at **`/health`** (the home page `/` also works).
- `Dockerfile` is only used if the host builds from a Dockerfile. It runs the same server.
- It never serves `server.js`, `package.json` or the `Dockerfile` to visitors.

In the host's settings: start command `npm start` (or leave it empty so it reads `package.json`), health check path `/health`, and, if there is a port setting, use the port the host shows (or set `PORT`).

## Hosting on GitHub Pages or any plain file host

Here there is nothing to start: the folder you upload is the site. Publish folder: the repository root (the folder that holds `index.html`). Build command: none. `404.html` is the not-found page and `.nojekyll` stops GitHub Pages from reshaping the files.

## Before it works for people

`config.js` must point to your server (`API_BASE`), and this website's address must be listed in the server's `CORS_ORIGIN` setting. All links are relative, so the site also works from a sub-folder.

## Security: where the work is done

The pages only **show** what the server sends and **send** what a person chooses. They never decide anything:

- **Health scores, loan health and group reports** are worked out on the server from the stored records. The browser cannot change them.
- **Loan approval order** (Chairperson, Secretary, two random members, Treasurer) is enforced by the server. A borrower cannot approve their own loan, and nobody can go out of turn.
- **Who may do what** is checked by the server on every request. Hiding a button in the page is only for tidiness.
- **Separate groups:** the server only returns a group's data to its own members.
- **Developer and client are separate pages.** The developer console is only answered for phone numbers listed on the server, so opening `developer.html` with a member's phone shows nothing.
- **Hostile text** (names, notices) is always escaped before it is shown, and a content security policy blocks injected scripts.
- Nothing secret is in these files. Keys, tokens and passwords live only in the server's `.env` file.

## What the app does now

Notice board with approvals, group money and Paybill payments (the Treasurer confirms each one), who has paid, receipts, loans with the full approval chain, expenses with Chairperson approval, members and leader roles, projects, meetings with a check-in PIN, minutes (current for 3 months, then archived and never deleted), funeral fund, insurance cover (NSSF and SHA), the leaders-only developer line, audit trail, group reports for leaders, and the sponsor report page, and the sponsor advert windows on Home (managed from the developer console), where each message has its own screen time and time on show.

## Not in this version

These exist in the sample-data demo but not here yet, because the server does not store them yet: educational material and quizzes, documents and uploads, member liabilities, the leader task tools, and AI voice minutes.
