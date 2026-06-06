# 🪽 Hermes Agent

> **No es un chatbot. No es un copiloto.**
> Es un agente que vive en el ecosistema VibraHalo, observa todos los repos, escucha señales AURA y **actúa** de forma autónoma.

---

## ¿Qué es Hermes?

Hermes es el **mensajero y orquestador** del ecosistema VibraHalo:

- 🔭 **Observa** todos los repos del ecosistema via GitHub API
- 📡 **Escucha** señales en el AURA Neural Bus
- ⚡ **Actúa** — crea issues, hace push de archivos, genera PRs cross-repo
- 🫀 **Heartbeat** — reporta estado del ecosistema cada hora
- 🧬 **Clasifica** repos: Brain / Compute / Intelligence / World / Economy / Agent

---

## Arquitectura

```
┌─────────────────────────────┐
│      🪽 HERMES AGENT         │
│                             │
│  ┌──────────────────────┐   │
│  │   GitHub API Scanner │   │
│  │   54+ repos → live   │   │
│  └──────────┬───────────┘   │
│             │               │
│  ┌──────────▼───────────┐   │
│  │   AURA Neural Bus    │   │
│  │   (pub/sub local)    │   │
│  └──────────┬───────────┘   │
│             │               │
│  ┌──────────▼───────────┐   │
│  │   Action Engine      │   │
│  │   cross-repo acts    │   │
│  └──────────────────────┘   │
└─────────────────────────────┘
         │          │
┌────────┘          └────────┐
▼                            ▼
vibrahalo-mempalace    VBC-Compute-Layer
(Mission Control)      (NERHIA backend)
```

---

## Señales AURA

| Señal | Descripción |
|---|---|
| `hermes:online` | Agente iniciado |
| `hermes:scan` | Scan de repos completado |
| `hermes:pulse` | Heartbeat periódico |
| `hermes:act` | Acción ejecutada (push, issue, PR) |
| `hermes:wake` | Repo dormido detectó nuevo commit |
| `hermes:alert` | Anomalía detectada en el ecosistema |

---

## Protocolo `hermes.json`

Cada repo del ecosistema puede declarar su identidad:

```json
{
  "repo": "nombre-del-repo",
  "layer": "brain|compute|intelligence|world|economy|agent",
  "signals": ["señales que emite"],
  "actions": ["acciones que acepta"],
  "endpoints": {}
}
```

---

## Setup

```bash
npm install
export GITHUB_TOKEN=ghp_...
export NERHIA_ENDPOINT=http://34.74.27.168:8000
export NOTIFY_EMAIL=leoncanales7@gmail.com
export OWNER=leoncanales23

npm start        # agente completo
npm run scan     # solo escanear repos
npm run pulse    # emitir heartbeat
```

---

## El Ecosistema

| Layer | Repos |
|---|---|
| 🧠 Brain | vibrahalo-mempalace, vibraalto-core |
| ⚡ Compute | VBC-Compute-Layer |
| 🧬 Intelligence | nerhia, nerhia-urban-sdk |
| 🌍 World | vibraworld, 3d, genesis-world, SimWorld |
| 💰 Economy | nexus, mining-cli |
| 🤖 Agent | jarvis, hermes-agent, ECC, openclaw |

---

*Hermes Agent — parte del ecosistema VibraHalo. AURA Neural Bus · NERHIA · VBC Compute Layer.*
