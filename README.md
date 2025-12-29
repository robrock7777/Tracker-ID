# TrackerID – O&M Lookup (PWA)

Una sola app para múltiples parques (PMGD) con búsqueda por:
- TK físico
- Plataforma + ControlBox_ID
- CT_CB_ST (strings)

## Deploy en GitHub Pages
1) Crea un repo (ej: `trackerid`).
2) Sube TODO el contenido de esta carpeta.
3) Settings → Pages → Source: `Deploy from a branch` → Branch: `main` / root.
4) Abre la URL. En Android/Chrome: menú → “Instalar aplicación”.

## Datos por parque
- `parks.json` = catálogo de parques (id + nombre + ruta del JSON).
- `data/<park>.json` = base por parque.

Formato del JSON:
```json
{ "version": 1, "updated": "YYYY-MM-DD", "trackers": [
  { "tk": 141, "plataforma": 3, "controlbox_id": 4, "channel": 50,
    "strings": ["01_02_03","01_02_04"], "string_orders":[1,2] }
]}
```

## Import CSV (desde la app)
Columnas recomendadas:
`TK, Plataforma, ControlBox_ID, Channel, Strings`

`Strings` debe venir separado por `;`:
`01_02_03;01_02_04;01_02_05`

## Offline
- Carga el parque una vez con señal y queda guardado localmente (IndexedDB).
- El service worker cachea el “app shell”.

