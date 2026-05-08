# CFC Reimbursement App

A friendly, lightweight reimbursement tracker for Couples for Christ.

This project lets users create, save, load, print, and delete reimbursement forms, plus upload supporting files per request number and download them later.

## What's Inside

- `angular/` - Angular frontend UI for the reimbursement form and list
- `nodejs-api/` - Express + NeDB backend API for storing forms and attachments
- `docker-compose.yml` - Optional containerized local run

## Requirements

- Node.js 18+ and npm
- (Optional) Docker + Docker Compose

## Run Locally (Without Docker)

### 1) Start the API

```bash
cd nodejs-api
npm install
npm start
```

API runs on `http://localhost:3001` by default.

### 2) Start the Angular app

Open a second terminal:

```bash
cd angular
npm install
npm start
```

Frontend runs on `http://localhost:4200`.

The Angular app uses `proxy.conf.json` so `/api/*` calls are forwarded to the Node API.

## Run With Docker

From the repository root:

```bash
docker compose up --build
```

## Main Features

- Create and update reimbursement forms
- Add multiple expense items and auto-calculate totals
- Upload multiple files per reimbursement
- Save files in per-request folders
- Load records from reimbursement list
- Download uploaded files from loaded records
- Delete records (with attachment folder cleanup)
- Print form as PDF

## Data Storage

- Form data is stored in `nodejs-api/data/forms.db`
- Uploaded files are stored in `nodejs-api/data/uploads/<request-number>/`

## Troubleshooting

- If uploads fail, confirm `multer` is installed in `nodejs-api` (`npm install`).
- If frontend cannot reach API, verify API is running on port `3001` and Angular proxy is enabled.
- If dependencies are broken, remove `node_modules` and reinstall in each app folder.

## License

Private/internal project.
