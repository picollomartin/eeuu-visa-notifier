# 🔔 eeuu-visa-notifier

Personal script for get notifications (through telegram messages) about visa eeuu appointment date updates in Buenos Aires.

Also will reschedule the appointment if a best date is available

## ⚙️ Environment

You will need some environment keys in order to run this script

```
BOT_TOKEN= # Telegram bot token
RESCHEDULE= # Reschedule appointment if a better date is available (optional, default to true)
CHAT_ID= # Telegram chat id for notifications
MAX_YEAR_CHECK= # Maximum year for lookup appointments (optional, default to 2024)
APPOINTMENT_ID= # Appointment id, lookup this in reeschedule appointment page
SHOW_BROWSER = # Useful for debugging, if true shows the browser when runnning script (optional, default to false)
USER= # User of https://ais.usvisa-info.com/
PASSWORD= # User password of https://ais.usvisa-info.com/
```

## 🏃 Running

```
node index.js
```
