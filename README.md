# Buzz Fly

Flight & hotel booking web application — Web Engineering Semester 8 final project.

> *To infinity and beyond!*

## Team

- Mohamed Gasser Elsawah — 221004214
- Rawan Mohamed Ismail — 221006089
- Malak Wael Ghabn — 221004011
- Ziad Amr Elmorshdy — 221004883
- Karim Mohamed Ismail — 221004798
- Omar Mohamed El-Shafei — 221005236

## Stack

- **Frontend:** HTML, CSS, vanilla JavaScript
- **Backend:** Python *(later phase)*
- **Database:** MySQL *(later phase)*

## Project structure

```
.
├── index.html              Home page
├── pages/                  All other HTML pages
│   └── auth/               Sign in / sign up / forgot password
├── css/
│   ├── base.css            Design tokens (colors, spacing, type)
│   ├── theme.css           Light / dark theme overrides
│   ├── components.css      Shared UI (navbar, buttons, cards, chips)
│   ├── layout.css          Grid / container helpers
│   └── pages/              One CSS file per page
├── js/
│   ├── main.js             Global: theme + language toggle, navbar
│   ├── i18n.js             Translation loader
│   ├── lang/               en.json, ar.json
│   ├── components/         Reusable UI logic (modal, dropdown, datepicker)
│   └── pages/              One JS file per page
├── assets/                 images, icons, logos, fonts
└── data/                   Mock JSON until backend is ready
```

## Run locally

This is a static site for now — open `index.html` in a browser, or serve the folder:

```bash
# Python (any version with http.server)
python -m http.server 5500

# then visit http://localhost:5500
```

## Workflow

See [CONTRIBUTING.md](CONTRIBUTING.md) for the team git workflow.
