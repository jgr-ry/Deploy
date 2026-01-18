<!-- prettier-ignore -->
# Deplo_Git ✨

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> Notificaciones a Discord para eventos en un repositorio (pushes, releases, PR merges) con formato claro y latencia controlada.

---

## Contenido rápido
- ✅ Rápido de integrar
- ⚙️ Configurable (rutas, ramas, tiempo de espera)
- 🧪 Testable localmente
- 🔒 Seguro usando GitHub Secrets

---

## Índice
- [Qué hace](#qué-hace)
- [Instalación](#instalación)
- [Variables de configuración](#variables-de-configuración)
- [Probar localmente](#probar-localmente)
- [Depuración](#depuración)
- [Contribuir](#contribuir)

---

## Qué hace
- Envía un **único** embed por evento con:
  - resumen de commits (enlaces a cada commit),
  - conteo rápido (➕ added · ✳️ modified · ➖ removed),
  - `Files (brief)` con resumen por archivo (usa la Compare API si está disponible),
  - enlace a la página de commits/compare.
- Diseñado para que la notificación salga rápido: el script espera hasta `DETAIL_TIMEOUT_MS` por la Compare API y, si no hay respuesta, envía la versión básica para no demorar.

---

## Instalación
1. Coloca la carpeta `Deplo_Git` en tu repo (o copia los ficheros donde prefieras).
2. Añade el secret `DISCORD_WEBHOOK_URL` (ver abajo).
3. Copia `.github/workflows/jgr-deploys.yml` y ajusta `working-directory` a la ruta de `Deplo_Git`.

### Configurar secret (UI)
- Repo → Settings → Secrets and variables → Actions → New repository secret
  - Name: `DISCORD_WEBHOOK_URL`
  - Value: `https://discord.com/api/webhooks/…`

### Configurar secret (CLI)
```bash
REPO="owner/repo"
echo -n "YOUR_WEBHOOK_URL" | gh secret set DISCORD_WEBHOOK_URL -b -R "$REPO"
```

---

## Variables de configuración
| Variable | Default | Descripción |
|---|---:|---|
| `NOTIFY_BRANCHES` | `main` | Ramas que notifican (`*` para todas). |
| `DETAIL_TIMEOUT_MS` | `3000` | Tiempo (ms) a esperar por la Compare API antes de enviar. |
| `EMBED_COLOR` | `0x2ecc71` | Color del embed. |
| `VERBOSE_LOGS` | `false` | `true` para logs verbosos. |

---

## Probar localmente
```bash
cd path/to/Deplo_Git
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
export GITHUB_EVENT_PATH="$(pwd)/event.sample.json"
node index.js
```

> En PowerShell usa `Set-Location` y `$env:DISCORD_WEBHOOK_URL`/`$env:GITHUB_EVENT_PATH` en su lugar.

---

## Depuración
- Activa `VERBOSE_LOGS=true` para imprimir el payload en Actions logs.
- Revisa GitHub Actions → job `notify` → step que ejecuta `node index.js`.

---

## Contribuir
PRs y mejoras bienvenidas. No incluyas webhooks en commits; usa secrets.

---

© Deplo_Git


## Ubicación
- Los ficheros del sistema de notificaciones están en `./Deplo_Git`.

## Cómo funciona
- Hay un workflow (ver `.github/workflows/jgr-deploys.yml`) que se dispara en `push` a `main` y en `release` cuando se publica una release.
- El workflow ejecuta `node index.js` dentro de `[JGR]/Deplo_Git`; el script procesa el payload y envía **un único** embed por push: espera hasta `DETAIL_TIMEOUT_MS` (por defecto 3000 ms) para obtener el resumen por archivo desde la Compare API y, si tiene éxito, lo incluye en el mismo embed; si no, envía el embed con la lista básica de archivos.

## Testing local
Puedes usar el `event.sample.json` incluido para pruebas locales.

PowerShell (Windows):

```powershell
cd ".\Deplo_Git"
$env:DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/..."  # temporal
$env:GITHUB_EVENT_PATH = (Resolve-Path .\event.sample.json).Path
node .\index.js
```

Bash (Linux/macOS / Git Bash):

```bash
cd "./Deplo_Git"
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."  # temporal
export GITHUB_EVENT_PATH="$(pwd)/event.sample.json"
node index.js
```

## Seguridad
- **No** añadas la URL del webhook en archivos del repo. Usa Secrets o las herramientas `scripts/set-secret.*` proporcionadas para establecer el secret de forma segura.


