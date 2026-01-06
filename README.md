# Wind Hex Map - React App

Interactive hexagonal visualization of wind turbine installations using MapLibre GL JS and H3 hexagonal indexing.

## Features

- 🗺️ **Multi-resolution hexagon aggregation** - Seamlessly transitions between zoom levels
- 🌬️ **Wind capacity visualization** - Color-coded by total MW per hexagon
- 📍 **Individual turbine exploration** - Zoom in to see detailed turbine information
- 🌍 **Multiple regions** - US, Germany, UK, and EU data
- 📱 **Responsive design** - Works on desktop and mobile

## Quick Start

```bash
cd react-app
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Data Sources

The app currently uses **synthesized data** based on real wind farm locations. The synthesis uses:

- Actual wind farm cluster locations from each region
- Realistic turbine specifications (manufacturers, models, capacities)
- Gaussian distribution around cluster centers for realistic spatial patterns

### Using Real Data

For **US data**, you can download the USGS Wind Turbine Database:
1. Visit https://eerscmap.usgs.gov/uswtdb/data/
2. Download the CSV file
3. Place it in `public/data/uswtdb.csv`
4. Modify `dataService.ts` to load the CSV using PapaParse

For **European data**, sources include:
- [The Wind Power Database](https://www.thewindpower.net/)
- [Open Power System Data](https://open-power-system-data.org/)
- National grid operator datasets

## Deploy to GitHub Pages

### Automatic Deployment (Recommended)

1. Push your code to the `main` branch
2. Go to repository Settings → Pages
3. Set Source to "GitHub Actions"
4. The workflow will automatically build and deploy

### Manual Deployment

```bash
cd react-app
npm run build
npm run deploy
```

## Tech Stack

- **React 18** + TypeScript
- **Vite** for fast development and building
- **MapLibre GL JS** for map rendering
- **H3-js** for hexagonal spatial indexing
- **CARTO** basemap (free, no API key needed)

## Configuration

Edit `vite.config.ts` to change the base path for deployment:

```ts
export default defineConfig({
  base: '/your-repo-name/',
})
```

## Project Structure

```
react-app/
├── src/
│   ├── App.tsx          # Main map component
│   ├── types.ts         # TypeScript interfaces
│   ├── dataService.ts   # Data synthesis & loading
│   ├── h3Utils.ts       # H3 hexagon utilities
│   ├── index.css        # Styles
│   └── main.tsx         # Entry point
├── public/
│   └── wind-turbine.svg # Favicon
└── package.json
```

## License

MIT
