# OBJ Circuits

Like Tinkercad Circuits, but on top of your own 3D models. Load an `.obj` file, place electronic components on it, wire them up and simulate.

## Features

- **Load a model.** Drop an `.obj` file onto the workspace, use **Open .obj**, or click **Try a sample**. The model is centered and scaled to fit.
- **Components.** LED (with color choice), push button and 9V battery. Drag them from the sidebar onto the model and they land on the surface you drop them on. You can also click a component to add it.
- **Move and rotate.** Select a part, then press <kbd>W</kbd> to move or <kbd>E</kbd> to rotate with the gizmo. <kbd>Del</kbd> deletes the selection.
- **Wires.** Click a pin, then click another pin. <kbd>Esc</kbd> cancels. Use **X-ray** to see wiring that runs inside the model.
- **Simulate.** Switch to **Simulate**, then click and hold a push button. An LED lights when it sits on a closed loop from the battery's + to its − with the right polarity, so the long leg (anode) goes toward +. A short across the battery shows a warning.

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # circuit solver unit tests
npm run build    # type-check + production build into dist/
```

Built with Vite, TypeScript and three.js, with no UI framework.

## Deploying

`.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages on every push to `main` (and to the development branch).

To set it up once, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.

> Don't use "Deploy from a branch". That publishes the unbuilt source, which shows up as an unstyled page that doesn't work. The app has to be built by Vite first, and the workflow does that for you.

## Code map

| Path | What it does |
| --- | --- |
| `src/scene/` | three.js viewport and the OBJ loader |
| `src/parts/` | Component models (LED, button, battery) and their pins |
| `src/wires/` | Wire geometry between pins |
| `src/editor/` | Document state (`Editor`) and mouse/keyboard handling (`Interaction`) |
| `src/sim/` | Netlist solver that decides which LEDs light |
| `src/ui/` | Sidebar, inspector, mode toggle and toasts |
