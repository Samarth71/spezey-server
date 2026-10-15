# Spezezy server

One small Node.js program (no packages to install) that:
- serves the Spezezy app (the `public/` folder, installable and offline),
- keeps classes, students' results, weekly leaderboard and most-missed sentences,
- sends **today's questions on WhatsApp by itself** every day at the class time,
- sends **push reminders** (works even when the app is closed) and nags 1 h and 3 h later to students who have not finished,
- opens the **weekly test** on the set day/time and sends the teacher a summary.

The questions come from the app's own generator (it loads `public/index.html`), so what the server sends is exactly what students see in the app.

## 1. Run it on your computer (test)
    node server.js
Open http://localhost:8080 . Without WhatsApp keys it runs in **dry mode**: messages are written to `data/outbox.log`.

## 2. Put it online
It needs any host that runs Node 18+ with **https** and a **persistent disk** (the class data is a file in `DATA_DIR`).
- **Render.com**: upload this folder to GitHub, New > Blueprint (uses `render.yaml`). Paid plan needed for the disk.
- **Railway / Fly.io**: add a volume, set `DATA_DIR` to the volume path.
- **Own VPS**: `node server.js` behind Caddy or nginx (https), run with pm2 or systemd.
- **Docker**: `docker run -p 8080:8080 -v spezezy:/data -e DATA_DIR=/data ...`
Set the same environment variables as in `.env.example`.

## 3. Push reminders
1. `node server.js --gen-keys`, copy the 3 lines into the host's environment variables (keep them; changing them logs everybody out of push).
2. Student: Class > "Turn on push reminders". iPhone needs iOS 16.4+ and the app added to the Home Screen first.

## 4. WhatsApp (the part that needs Meta)
You need a Meta developer account, a WhatsApp Business number and an approved message **template**. WhatsApp does not allow a business to message people first with free text, so a template is required.
1. developers.facebook.com > Create app > Business > add **WhatsApp**. Note the **Phone number ID** and make a permanent **access token** (System user).
2. WhatsApp Manager > Message templates > Create. Category **Utility**, name `spezezy_daily`, language English, body exactly:
       Hi {{1}}! Today's Spezezy questions: {{2}}
   (Parameters cannot contain line breaks; the server joins the questions with " | " and cuts at 1000 characters, so use 10 questions or fewer for WhatsApp.)
3. Set `WA_TOKEN`, `WA_PHONE_ID`, `WA_TEMPLATE=spezezy_daily`. Restart.
4. Only message students/parents who agreed to receive it. Meta charges per template message (see their price list) and a student can block you.

## 5. How the teacher uses it
In the app: Class > Create class (set time, daily level, weekly test) > add students (Name, phone) > **Register class on server**.
Students join with the **Class ID + PIN** shown there (the old long code still works too).
The same page shows who finished today, the leaderboard and the most missed sentences. Buttons send questions / answer key / "test is open" immediately.

## Safety notes
- PINs are stored hashed (scrypt); join attempts are rate limited. Phone numbers are stored in `db.json` - back up and protect that folder.
- The teacher key lives on the teacher's phone. If they delete the app data they lose control of that class; register a new one.
- A 4-digit PIN is easy to guess. Use 6+ characters.

## Update the app later
Replace `public/index.html`, then change `V` in `public/sw.js` (spezezy-v3 to spezezy-v4) so phones refresh.
