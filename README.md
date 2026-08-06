# Q — Service Token Display System

A simple token/queue system for a service counter. Customers pick a service from a
grid and get a token number; a separate display screen shows the current and
previous token for every service in real time. Admins can manage the list of
services and download a daily report of how many customers were served.

## Pages

- **Customer page** — `http://localhost:3000/` — grid of services, tap one to
  generate a token.
- **Display page** — `http://localhost:3000/display.html` — open on a second
  screen/tablet/monitor. Shows current + previous token per service and updates
  instantly (via WebSocket) whenever a customer takes a token.
- **Admin page** — `http://localhost:3000/admin.html` — password-protected. Add
  or delete services, and download a CSV report of customers served per service
  for any date.

## Setup

1. Install [Node.js](https://nodejs.org/) 18 or later.
2. Install dependencies:
   ```
   npm install
   ```
3. Copy `.env.example` to `.env` and set your own admin password:
   ```
   copy .env.example .env
   ```
   Then edit `.env`:
   ```
   PORT=3000
   ADMIN_PASSWORD=your-own-password
   ```
4. Start the server:
   ```
   npm start
   ```
5. Open the pages above in a browser. Since everything runs on your local
   machine, other devices on the same WiFi network can reach it too using your
   computer's local IP instead of `localhost` (e.g. `http://192.168.1.23:3000/`).

## How it works

- Each service has its own daily token sequence — the first token of each day
  is `#1`. Current/previous token numbers reset automatically at the start of
  a new day.
- Data is stored in `data/db.json`, created automatically on first run. Back
  this file up if you want to keep history beyond what the daily report
  captures.
- Deleting a service in the admin page removes it from the customer grid but
  keeps its history so past daily reports stay accurate.
- The daily report is a CSV download (`Service,Customers Served`) for a date
  you pick, defaulting to today.

## Notes

- This app is designed to run on one machine on a trusted local network (e.g.
  a shop counter). The admin login is a single shared password, not full user
  accounts — enough to keep casual visitors from editing services, not a
  substitute for real access control if exposed to the internet.
