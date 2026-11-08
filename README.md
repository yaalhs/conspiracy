# Conspiracy Board for Owlbear Rodeo

An Owlbear Rodeo extension for marking up a shared scene with evidence pins and connecting strings. Pins and strings are placed on the Notes layer so they remain above other scene content, and can be moved or removed with Owlbear's tools.

## Use

1. Host the built `dist/` folder and add its `manifest.json` URL as an extension in Owlbear Rodeo.
2. Select Owlbear's **Draw** tool. The **Pin** and **String** modes appear in its toolbar. Pins use Draw's fill color, and strings use Draw's stroke color. The extension has no separate side-panel button.
3. Choose **Pin** and click once to place a pin. Choose **String** and drag across the map to draw a connection; the string snaps through pins along its path.
4. Select and edit or delete the resulting drawings with Owlbear's regular scene tools.

## Development

Install dependencies with `npm install`, run `npm run dev`, and load the local Vite manifest URL (`http://localhost:5173/manifest.json`) in Owlbear Rodeo. Run `npm run build` to generate deployable files in `dist/`.

## Deploy with GitHub Pages

The GitHub Actions workflow builds and deploys the extension when changes are pushed to `main`. It writes absolute GitHub Pages URLs into the published manifest so Owlbear can resolve its icon and background page correctly. In the repository settings, open **Pages** and set the source to **GitHub Actions**. After the workflow succeeds, add the published `manifest.json` URL as an extension in Owlbear Rodeo. For `yaalhs/conspiracy`, that URL is `https://yaalhs.github.io/conspiracy/manifest.json`.
