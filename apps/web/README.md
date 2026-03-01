# MythFight Web Client

Client React + Vite pour afficher l'etat de partie recu depuis le serveur WebSocket.

## Scripts

- `pnpm --filter @mythfight/web dev`
- `pnpm --filter @mythfight/web build`
- `pnpm --filter @mythfight/web preview`
- `pnpm --filter @mythfight/web lint`

## Variables d'environnement

Copie `.env.example` vers `.env.local`.

- `VITE_WS_URL`
  - Dev: `ws://localhost:8082`
  - Production PWA: `wss://<game-server-public>`

Les options debug (affichage panel + logs snapshot) sont controlees directement dans l'UI.

## PWA (mobile)

La web app est installable (Android/iOS) avec:

- `manifest.webmanifest`
- service worker auto-update via `vite-plugin-pwa`
- fallback offline minimal (app shell disponible, gameplay online indisponible sans serveur)

### Test mobile

1. Deployer `apps/web` sur Vercel.
2. Configurer `VITE_WS_URL=wss://<game-server-public>`.
3. Ouvrir l'URL depuis mobile.
4. Installer depuis le navigateur (`Installer` sur Android/desktop Chromium, `Ajouter a l'ecran d'accueil` sur iOS).
