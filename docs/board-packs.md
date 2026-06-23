# Board Packs

Board packs let tools and agents create Phosphene workspaces and boards without clicking through the UI.

## Folder Layout

```text
My Board Pack/
  manifest.json
  assets/
  boards/
```

## Manifest

`manifest.json` describes the workspace, optional assets, and board files in the pack.

```json
{
  "schemaVersion": 1,
  "workspace": {
    "name": "Imported Workspace",
    "icon": "*"
  },
  "assets": [
    {
      "id": "image-1",
      "path": "assets/image-1.png",
      "mimeType": "image/png"
    }
  ],
  "boards": [
    {
      "id": "board-1",
      "name": "Board 1",
      "path": "boards/board-1.json"
    }
  ]
}
```

## Board Files

Each board file contains versioned canvas data.

```json
{
  "schemaVersion": 1,
  "canvasData": {
    "elements": [],
    "appState": {
      "viewBackgroundColor": "#ffffff"
    },
    "files": {}
  }
}
```

Image files in board JSON can remain inline as ordinary `data:image/...;base64,...` URLs. To reference a file from the pack, use `phosphene-pack-asset://asset-id`; the importer copies the asset into Phosphene's image store and rewrites it to a `phosphene-file://images/...` URL for the created board.

## Import From CLI

By default, each import creates a new workspace from `manifest.workspace`.

```bash
npm run board-pack:import -- --pack /path/to/MyBoardPack --user-data-dir "$HOME/Library/Application Support/app.phosphene.desktop"
```

To append boards to an existing workspace, pass exactly one target selector. Targeted imports append boards to the selected workspace without creating a new workspace or updating workspace metadata from `manifest.workspace`. Repeated targeted imports keep appending to the selected workspace and make it active.

```bash
npm run board-pack:import -- --pack /path/to/Day2Pack --user-data-dir "$HOME/Library/Application Support/app.phosphene.desktop" --target-workspace-id 4fd7f4a7d0a741efb47a7c1ab8f0ad42
npm run board-pack:import -- --pack /path/to/Day2Pack --user-data-dir "$HOME/Library/Application Support/app.phosphene.desktop" --target-workspace-name "Vacation Plan"
npm run board-pack:import -- --pack /path/to/Day2Pack --user-data-dir "$HOME/Library/Application Support/app.phosphene.desktop" --target-active-workspace
```

Name targeting uses exact, case-sensitive matches, including leading and trailing whitespace, and requires exactly one non-deleted workspace with that name. If a workspace name begins with `--`, pass it as `--target-workspace-name=--name`. If multiple workspaces share a name, use `--target-workspace-id`.

## Production Safety

Remote debugging is development-only. It is enabled only when running an unpackaged app with:

```bash
PHOSPHENE_DEBUG_PORT=9222 npm run dev
```

Do not enable remote debugging in packaged production builds.
