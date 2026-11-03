# Maploom — PDF Map Studio

[Live app](https://maploom-pdf-editor.mikesheer001.chatgpt.site)

Import PDF mind maps, move and edit topics, connect branches, undo, save editable projects, and export sharp vector PDFs.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm start
```

Open http://localhost:8080. Installation prepares browser libraries and Unicode export fonts. Deploy by serving `dist/` after installation.

## Controls

- Tap/click to edit; drag to move without opening editing options.
- Move branches Off: move only the dragged topic.
- Move branches On: outer branches follow with delayed spring physics; deeper branches follow more slowly. Respects reduced-motion preferences.
- Branches reorient away from their parent as you drag them around the map.
- Drop a topic onto another topic to retether its branch; invalid cycles are prevented.
- Drag the canvas to pan; pinch or use zoom controls.
- Save a `.maploom` project for a portable backup.

Edits autosave locally in IndexedDB. There is no cloud project synchronization. PDF processing happens in the browser. Digital vector maps work best; review inferred connections. Scans are reference images without automatic OCR.

## Tests

```sh
npm test
```

Verifies the 72-topic, 71-connection example, vector PDF round trips, Unicode symbols, boxed/unboxed maps, empty pages, project validation, outward branch rotation, drop targeting, cycle prevention, and subtree retention.

## Source synchronization

Application files in `dist/` match the ChatGPT Site's published version 5 (source commit `5811218ba0fb332e5bf7079b0c1d3790a730b01c`), synced on November 3, 2026. Updates between this repository and the ChatGPT Site are manual.

Dependencies retain their respective licenses. No additional open-source license is granted to the application code.
