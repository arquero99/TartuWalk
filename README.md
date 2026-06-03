# TartuWalk — Quality-Aware Pedestrian Route Planner

> Presented at **[Mobile Tartu 2026](https://mobiletartu.ut.ee/)** — International Conference on Mobile Technologies, Tartu, Estonia.

---

## Motivation

Traditional route planners optimize for **distance** or **travel time**. When the goal is walking, these metrics miss what actually matters: the quality of the experience along the way.

A shortest-path route may lead pedestrians through busy arterial roads, polluted corridors, or grey urban stretches — even when a slightly longer alternative offers wide tree-lined avenues, parks, and cleaner air. TartuWalk is built on the premise that a pedestrian planner should optimize for the **quality of the walk**, not just its length.

---

## Objective

TartuWalk computes pedestrian routes that:

- **Prioritize wide, walkable avenues** — avoiding high-traffic or narrow roads.
- **Traverse green spaces** — routing through parks, tree-lined paths, and natural areas.
- **Minimize air pollution exposure** — penalizing segments near heavy traffic or industrial zones.
- **Surface points of interest** — listing notable places (cafés, monuments, viewpoints, etc.) along the computed route.

The underlying graph search uses a custom **A\* algorithm with a perfect heuristic** (exact Dijkstra from the destination) over an OpenStreetMap-derived weighted graph, where edge costs encode walkability, greenness, and pollution factors rather than bare distance.

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│              Browser Client                 │
│         tartu-walker.html (Leaflet)         │
│  - Map UI, origin/destination input         │
│  - Route rendering, POI display             │
│  - A* + Dijkstra graph search (client-side) │
└────────────────────┬────────────────────────┘
                     │ HTTP (proxied)
┌────────────────────▼────────────────────────┐
│              Node.js Backend                │
│              backend/server.js              │
│  - CORS proxy for Overpass API (OSM data)   │
│  - CORS proxy for Nominatim (geocoding)     │
│  - Rate limiting (1 req/s Overpass)         │
└──────────┬──────────────────┬───────────────┘
           │                  │
┌──────────▼──────┐  ┌────────▼───────┐
│  Overpass API   │  │ Nominatim API  │
│ (OSM graph data)│  │  (geocoding)   │
└─────────────────┘  └────────────────┘
```

**Key components:**

| Component | Description |
|---|---|
| `tartu-walker.html` | Single-page frontend — map rendering, graph construction, route algorithm |
| `backend/server.js` | Lightweight Node.js proxy — resolves CORS for OSM APIs |
| `documentation/heuristics.md` | How the A\* heuristic is built |
| `documentation/admissibility.md` | Formal proof of heuristic admissibility and consistency |
| `documentation/DEPLOYMENT.md` | Deployment instructions |
| `documentation/deployOpenStreetWalker.md` | OSM-specific deployment notes |

The cost function assigned to each graph edge incorporates **pedestrian surface type**, **road category**, **greenery**, and **pollution estimates** as multiplicative factors over raw haversine distance. Routes are computed entirely client-side from OSM data fetched on demand.

---

## Documentation

Detailed technical documentation is available in [/documentation](documentation/):

- [Heuristic design](documentation/heuristics.md) — why A\* with Dijkstra-from-destination is used instead of geometric estimates.
- [Admissibility proof](documentation/admissibility.md) — formal guarantee that the heuristic is consistent and optimal.
- [Deployment guide](documentation/DEPLOYMENT.md) — how to deploy the backend proxy.
- [OpenStreetWalker deployment](documentation/deployOpenStreetWalker.md) — OSM-specific setup notes.
- [Backend README](backend/README.md) — API endpoints, rate limiting, and configuration.

---

## Acknowledgements & Funding

This project is supported by the following institutions:

- **EIT DTN** — European Institute of Innovation and Technology, Doctoral Training Network
- **INSIA** — Instituto de Investigación del Automóvil, Universidad Politécnica de Madrid
- **UPM ETSISI** — Escuela Técnica Superior de Ingeniería de Sistemas Informáticos, Universidad Politécnica de Madrid

---

## License

MIT
