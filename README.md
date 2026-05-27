# Hermes Skills Manager

A Hermes dashboard plugin for browsing and editing skill files stored in the local skills directory.

## Features

- **Skills Tab**: Browse all installed skills with search filtering
- **Files Tab**: View and edit individual skill files directly from the dashboard
  - Click any file to preview its contents
  - Edit button toggles editable textarea mode
  - Save button writes changes back to disk
- **Info Tab**: View skill metadata (name, description, category, linked files)

## Plugin Description

Skills Manager provides a UI for managing local Hermes skill files. It connects to a Python backend API (`/api/plugins/skills-manager/`) that handles file I/O operations against the local skills directory. The plugin runs as a tab inside the Hermes dashboard at `http://127.0.0.1:9119`.

## How to Integrate with Hermes Dashboard

The plugin is auto-discovered by the Hermes dashboard when placed in `~/.hermes/plugins/skills-manager/`.

**Requirements:**
- Dashboard plugin manifest: `dashboard/plugin.json`
- Web UI bundle: `dashboard/dist/index.js`
- Backend API handler: `dashboard/plugin_api.py`
- Plugin registered in Hermes config (`plugins.skills-manager` enabled)

**File structure:**
```
skills-manager/
├── dashboard/
│   ├── dist/
│   │   └── index.js       # Built UI bundle
│   ├── plugin_api.py      # Backend API endpoints
│   ├── plugin.json        # Plugin manifest
│   └── src/               # Source files (JSX)
├── skills_manager/
│   └── __init__.py        # Plugin core logic
└── README.md
```

**Installation:**
1. Copy plugin to `~/.hermes/plugins/skills-manager/`
2. Enable in `~/.hermes/config.yaml`:
   ```yaml
   plugins:
     skills-manager:
       enabled: true
   ```
3. Restart Hermes dashboard
4. The "Skills Manager" tab appears automatically in the dashboard sidebar

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/plugins/skills-manager/skills` | List all skills |
| GET | `/api/plugins/skills-manager/skills/{name}` | Get skill details |
| GET | `/api/plugins/skills-manager/skills/{name}/files` | List skill files |
| GET | `/api/plugins/skills-manager/skills/{name}/files/{path}` | Read file contents |
| PUT | `/api/plugins/skills-manager/skills/{name}/files/{path}` | Write file contents |