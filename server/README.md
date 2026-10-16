# Naija Streets live server

Lets real players see each other in Mushin: walking, driving, riding in each other's cars, and chatting.
The game page stays on GitHub Pages; this small server only passes on where every player is (10 times a second).

## Run it on your computer (for testing)
```
cd server
npm install
npm start
```
Then serve the game (`python3 -m http.server 8000` in the main folder) and open http://localhost:8000 in two browser windows.
The game finds the local server by itself. `?solo=1` plays offline.

## Put it online with Fly.io (once)
1. Make a Fly.io account at https://fly.io and add a payment card (a small server costs about $2–5 a month).
2. Install the Fly tool: https://fly.io/docs/flyctl/install/
3. In this `server` folder:
```
fly auth login
fly launch --copy-config --no-deploy      # keep the name "naija-streets" if it is free
fly deploy
```
4. Open https://naija-streets.fly.dev — it should show `{"ok":true,...}`.

If Fly gives you a different name (say `naija-streets-92`), change `LIVE` at the top of `src/net.js` to
`wss://naija-streets-92.fly.dev`, then stamp and push the game as usual.

## Updating the server later
Change `server.js`, then run `fly deploy` in this folder. Players reconnect by themselves.

## Settings (fly.toml `[env]`)
- `ROOM_CAP` — players per copy of the city (default 40). When a room is full, the next player starts a new one.
- `ORIGINS` — web pages allowed to connect (default: the GitHub Pages site and localhost).

## Check who is online
https://naija-streets.fly.dev shows the number of players and rooms.
