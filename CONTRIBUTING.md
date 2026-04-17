# Team workflow — Buzz Fly

A short cheat-sheet for the 6-person team. Read once, refer back when stuck.

---

## One-time setup (each teammate, on their own machine)

```bash
# 1. Clone the repo (replace URL with the real one)
git clone https://github.com/<owner>/buzz-fly.git
cd buzz-fly

# 2. Set your git identity (only if not set globally)
git config user.name  "Your Name"
git config user.email "your-github-email@example.com"
```

That's it. No `npm install`, no build step — it's plain HTML/CSS/JS.

To preview the site:

```bash
python -m http.server 5500
# open http://localhost:5500
```

---

## Daily workflow

### 1. Always start with the latest `main`

```bash
git checkout main
git pull
```

### 2. Create a branch for your task

Branch names: `feature/<short-name>` or `fix/<short-name>`.

```bash
git checkout -b feature/home-page
# or
git checkout -b fix/navbar-mobile
```

### 3. Work, save, commit often

```bash
git status                # see what changed
git add <files>           # stage specific files (avoid `git add .`)
git commit -m "home: add hero section + search card"
```

**Commit message style:** `<area>: <what changed>` — short, lowercase, imperative.
Examples:
- `home: add popular destinations section`
- `flights: build filter sidebar`
- `css: extract button variants into components.css`
- `fix: navbar overlap on mobile`

### 4. Push your branch

```bash
git push -u origin feature/home-page
```

### 5. Open a Pull Request on GitHub

- Go to the repo on github.com
- Click **Compare & pull request**
- Title: same style as a commit message
- Description: 2–3 bullets on what you did + a screenshot if it's UI
- Request a review from at least 1 teammate
- Wait for approval, then **merge** (use *Squash and merge* to keep history clean)

### 6. After merging, clean up

```bash
git checkout main
git pull
git branch -d feature/home-page          # delete local branch
git push origin --delete feature/home-page  # delete remote branch
```

---

## Who works on what

To avoid conflicts, **split by page**, not by file. One person owns one page at a time:

| Page | Files they touch |
|---|---|
| Home | `index.html`, `css/pages/home.css`, `js/pages/home.js` |
| Flights | `pages/flights.html`, `css/pages/flights.css`, `js/pages/flights.js` |
| Hotels | `pages/hotels.html`, `css/pages/hotels.css`, `js/pages/hotels.js` |
| ... | (same pattern) |

**Shared files** (`css/base.css`, `css/components.css`, `js/main.js`) — coordinate in the group chat before editing. These cause the most merge conflicts.

---

## When something goes wrong

### "I have unsaved changes but need to pull"

```bash
git stash             # tuck them away
git pull
git stash pop         # bring them back
```

### "I committed to the wrong branch"

```bash
git log -1            # copy the commit hash
git reset --soft HEAD~1   # undo the commit, keep changes staged
git checkout correct-branch
git commit -m "..."
```

### "Merge conflict"

1. Open the file — find `<<<<<<<` markers
2. Decide which version to keep (or combine both)
3. Delete the markers
4. `git add <file>` then `git commit`
5. If lost, ask in the group chat **before** running anything destructive

### Never do these without asking the team

- `git push --force` (rewrites history for everyone)
- `git reset --hard` on a shared branch
- Pushing directly to `main` — always go through a PR
- Committing secrets (`.env`, passwords, API keys)

---

## Recommended VS Code extensions

- **Live Server** — auto-reload preview
- **GitLens** — see who changed what
- **Prettier** — auto-format HTML/CSS/JS (so we all use the same style)
