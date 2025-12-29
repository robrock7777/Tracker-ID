/* TrackerID – PWA (vanilla JS)
   - Selector de parque (parks.json)
   - Búsqueda: TK, Plataforma+ControlBox_ID, CT_CB_ST
   - Import/Export CSV/JSON por parque
   - Offline: IndexedDB + Service Worker (app shell)
*/

const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

const state = {
  parks: [],
  activePark: null,     // {id,name,data}
  dataset: { version: 1, updated: "", trackers: [] },
  lastResult: null,
  tab: "buscar",
};

function pad2(n){ return String(n).padStart(2,"0"); }
function pad3(n){ return String(n).padStart(3,"0"); }

function normalizeCTCBST(s){
  if(!s) return "";
  const t = String(s).trim().replace(/-/g,"_");
  const m = t.match(/^(\d{1,2})_(\d{1,2})_(\d{1,2})$/);
  if(!m) return t;
  return `${pad2(m[1])}_${pad2(m[2])}_${pad2(m[3])}`;
}

function normalizeHeaders(h){
  return String(h||"")
    .trim()
    .toLowerCase()
    .replace(/\s+/g,"_")
    .replace(/[()]/g,"");
}

// ---- IndexedDB tiny wrapper (no deps)
const idb = (() => {
  const DB_NAME = "trackerid_db";
  const STORE = "parks";
  const VERSION = 1;

  function open(){
    return new Promise((resolve,reject)=>{
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains(STORE)){
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function get(key){
    const db = await open();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction(STORE,"readonly");
      const st = tx.objectStore(STORE);
      const req = st.get(key);
      req.onsuccess = ()=> resolve(req.result || null);
      req.onerror = ()=> reject(req.error);
    });
  }

  async function set(key, value){
    const db = await open();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction(STORE,"readwrite");
      const st = tx.objectStore(STORE);
      const req = st.put(value, key);
      req.onsuccess = ()=> resolve(true);
      req.onerror = ()=> reject(req.error);
    });
  }

  async function del(key){
    const db = await open();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction(STORE,"readwrite");
      const st = tx.objectStore(STORE);
      const req = st.delete(key);
      req.onsuccess = ()=> resolve(true);
      req.onerror = ()=> reject(req.error);
    });
  }

  return {get,set,del};
})();

// ---- UI rendering
function setTab(tab){
  state.tab = tab;
  $$(".tabs button").forEach(b=>{
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  renderMain();
}

function setPills(){
  $("#pillPark").textContent = state.activePark ? state.activePark.name : "Sin parque";
  $("#pillCount").textContent = `${state.dataset.trackers?.length || 0} TK`;
}

function renderMain(){
  const el = $("#panelMain");
  if(state.tab === "buscar") el.innerHTML = renderBuscar();
  if(state.tab === "listado") el.innerHTML = renderListado();
  if(state.tab === "admin") el.innerHTML = renderAdmin();
  if(state.tab === "ayuda") el.innerHTML = renderAyuda();
  wirePanelEvents();
}

function renderBuscar(){
  return `
    <h2>Buscar</h2>
    <div class="two">
      <div>
        <label for="inTk">Tracker físico (ej: 141)</label>
        <input id="inTk" inputmode="numeric" placeholder="1 - 207" />
      </div>
      <div>
        <label>&nbsp;</label>
        <button class="primary" id="btnFindTk">Buscar TK</button>
      </div>
    </div>

    <div class="sep"></div>

    <div class="two">
      <div>
        <label for="inPlat">Plataforma</label>
        <input id="inPlat" inputmode="numeric" placeholder="1 - 3" />
      </div>
      <div>
        <label for="inCb">ControlBox_ID</label>
        <input id="inCb" inputmode="numeric" placeholder="01 - 72 / 65 / 70" />
      </div>
    </div>
    <div style="margin-top:10px;">
      <button class="primary" id="btnFindCb">Buscar por Plataforma + ControlBox</button>
    </div>

    <div class="sep"></div>

    <div class="two">
      <div>
        <label for="inString">CT_CB_ST (ej: 01_02_03)</label>
        <input id="inString" class="mono" placeholder="01_02_03" />
      </div>
      <div>
        <label>&nbsp;</label>
        <button class="primary" id="btnFindString">Buscar String</button>
      </div>
    </div>

    <div class="sep"></div>

    <h2>Resultado</h2>
    <div id="resultBox">${renderResult(state.lastResult)}</div>
  `;
}

function renderResult(res){
  if(!state.activePark) return `<div class="hint">Selecciona un parque y presiona “Cargar”.</div>`;
  if(!res) return `<div class="hint">Sin resultados aún. Prueba con TK, Plataforma+ControlBox o CT_CB_ST.</div>`;
  if(res.type === "not_found"){
    return `<div class="hint">No encontrado. Revisa el valor ingresado o importa la base del parque.</div>`;
  }
  const t = res.tracker;
  const tkLabel = `TK${pad3(t.tk)}`;
  const cbLabel = `P${t.plataforma}-ID${pad2(t.controlbox_id)}`;
  const strings = (t.strings||[]).map((s,i)=>{
    const ord = t.string_orders?.[i] ?? (i+1);
    return `<span class="pill mono">${s} (#${ord})</span>`;
  }).join(" ");
  const stringHit = res.type === "string" ? `<div class="hint">Coincidencia: <span class="pill mono">${res.ct_cb_st}</span></div>` : "";
  return `
    ${stringHit}
    <div class="kvs">
      <div>Parque</div><div><b>${state.activePark.name}</b></div>
      <div>Tracker</div><div><b>${tkLabel}</b> <span class="pill">Físico ${t.tk}</span></div>
      <div>Plataforma</div><div><span class="pill">P${t.plataforma}</span></div>
      <div>ControlBox</div><div><span class="pill">${cbLabel}</span> <span class="pill">ID ${t.controlbox_id}</span></div>
      <div>Channel</div><div><span class="pill">CH ${t.channel}</span></div>
      <div>Strings</div><div style="display:flex; gap:6px; flex-wrap:wrap;">${strings || "<span class='hint'>Sin strings cargados</span>"}</div>
    </div>
  `;
}

function renderListado(){
  const items = (state.dataset.trackers||[])
    .slice()
    .sort((a,b)=> a.tk-b.tk)
    .map(t=>{
      const tkLabel = `TK${pad3(t.tk)}`;
      const sCount = (t.strings||[]).length;
      return `
        <div class="item" data-tk="${t.tk}">
          <div>
            <b>${tkLabel}</b> <small>• P${t.plataforma} • ID ${pad2(t.controlbox_id)} • CH ${t.channel}</small>
            <div class="hint">${sCount ? `${sCount} strings` : "sin strings"}</div>
          </div>
          <button data-action="open" data-tk="${t.tk}">Abrir</button>
        </div>
      `;
    }).join("");

  return `
    <h2>Listado</h2>
    <div class="two">
      <div>
        <label for="inFilter">Filtro rápido (TK / ID / CH / string)</label>
        <input id="inFilter" placeholder="ej: TK141, 01_02_, CH 50, P2" />
      </div>
      <div>
        <label>&nbsp;</label>
        <button id="btnApplyFilter">Filtrar</button>
      </div>
    </div>
    <div class="hint">Tip: filtra por “01_02_” para ver todos los strings de un CT/CB.</div>
    <div class="sep"></div>
    <div class="list" id="listBox">${items || "<div class='hint'>No hay datos cargados para este parque.</div>"}</div>
  `;
}

function renderAdmin(){
  return `
    <h2>Admin (por parque)</h2>
    <div class="hint">Importa/exporta la base del parque activo. Formato recomendado: TK, Plataforma, ControlBox_ID, Channel/Canal, Strings (separado por “;”).</div>
    <div class="sep"></div>

    <div class="two">
      <div>
        <label for="fileImport">Importar CSV o JSON</label>
        <input id="fileImport" type="file" accept=".csv,.json,text/csv,application/json" />
        <div class="hint">CSV: columna “Strings” con “01_02_03;01_02_04…”.</div>
      </div>
      <div>
        <label>&nbsp;</label>
        <button class="primary" id="btnImport">Importar al parque</button>
      </div>
    </div>

    <div class="sep"></div>

    <div class="two">
      <button id="btnExportCSV">Exportar CSV</button>
      <button id="btnExportJSON">Exportar JSON</button>
    </div>

    <div class="sep"></div>

    <div class="two">
      <button id="btnForgetPark">Borrar caché local del parque</button>
      <button id="btnResetEmpty">Resetear parque (vacío)</button>
    </div>

    <div class="hint" id="adminMsg"></div>
  `;
}

function renderAyuda(){
  return `
    <h2>Ayuda</h2>
    <div class="hint">
      <b>Objetivo:</b> buscar rápido TK / ControlBox_ID / Channel / CT_CB_ST en terreno (offline).
      <div class="sep"></div>
      <b>Cómo agregar parques:</b> edita <span class="mono">parks.json</span> y crea un archivo en <span class="mono">data/</span>.
      <div class="sep"></div>
      <b>Formato CSV recomendado:</b><br/>
      <span class="mono">TK,Plataforma,ControlBox_ID,Channel,Strings</span><br/>
      <span class="mono">141,3,4,50,01_02_03;01_02_04;01_02_05</span>
      <div class="sep"></div>
      <b>Offline:</b> carga el parque una vez con señal. Queda guardado localmente.
    </div>
  `;
}

function wirePanelEvents(){
  // Tabs already wired globally
  if(state.tab === "buscar"){
    $("#btnFindTk")?.addEventListener("click", onFindTk);
    $("#btnFindCb")?.addEventListener("click", onFindCb);
    $("#btnFindString")?.addEventListener("click", onFindString);
  }
  if(state.tab === "listado"){
    $("#btnApplyFilter")?.addEventListener("click", onApplyFilter);
    $("#listBox")?.addEventListener("click", (e)=>{
      const btn = e.target.closest("button[data-action='open']");
      if(!btn) return;
      const tk = parseInt(btn.dataset.tk,10);
      const t = state.dataset.trackers.find(x=>x.tk===tk);
      if(t){
        state.lastResult = {type:"tk", tracker:t};
        setTab("buscar");
        setTimeout(()=> $("#resultBox")?.scrollIntoView({behavior:"smooth"}), 50);
      }
    });
  }
  if(state.tab === "admin"){
    $("#btnImport")?.addEventListener("click", onImport);
    $("#btnExportCSV")?.addEventListener("click", ()=> exportCSV());
    $("#btnExportJSON")?.addEventListener("click", ()=> exportJSON());
    $("#btnForgetPark")?.addEventListener("click", onForgetPark);
    $("#btnResetEmpty")?.addEventListener("click", onResetEmpty);
  }
}

// ---- Search handlers
function ensureLoaded(){
  if(!state.activePark) return false;
  if(!(state.dataset.trackers||[]).length) return true; // allow empty
  return true;
}

function onFindTk(){
  if(!ensureLoaded()) return;
  const v = $("#inTk").value.trim();
  const tk = parseInt(v,10);
  const t = state.dataset.trackers.find(x=>x.tk === tk);
  state.lastResult = t ? {type:"tk", tracker:t} : {type:"not_found"};
  $("#resultBox").innerHTML = renderResult(state.lastResult);
}

function onFindCb(){
  if(!ensureLoaded()) return;
  const p = parseInt($("#inPlat").value.trim(),10);
  const cb = parseInt($("#inCb").value.trim(),10);
  const t = state.dataset.trackers.find(x=>x.plataforma===p && x.controlbox_id===cb);
  state.lastResult = t ? {type:"cb", tracker:t} : {type:"not_found"};
  $("#resultBox").innerHTML = renderResult(state.lastResult);
}

function onFindString(){
  if(!ensureLoaded()) return;
  const raw = $("#inString").value.trim();
  const key = normalizeCTCBST(raw);
  let hit = null;
  let hitTracker = null;
  for(const t of state.dataset.trackers){
    const ss = t.strings || [];
    const idx = ss.findIndex(s => normalizeCTCBST(s) === key);
    if(idx !== -1){
      hit = {t, idx};
      hitTracker = t;
      break;
    }
  }
  state.lastResult = hitTracker ? {type:"string", tracker: hitTracker, ct_cb_st:key} : {type:"not_found"};
  $("#resultBox").innerHTML = renderResult(state.lastResult);
}

// ---- Filter listing
function onApplyFilter(){
  const q = ($("#inFilter").value||"").trim().toLowerCase();
  const box = $("#listBox");
  if(!q){
    // rerender
    renderMain();
    return;
  }
  const filtered = (state.dataset.trackers||[]).filter(t=>{
    const tkLabel = `tk${pad3(t.tk)}`;
    const blob = [
      tkLabel, String(t.tk), `p${t.plataforma}`,
      `id${pad2(t.controlbox_id)}`, String(t.controlbox_id),
      `ch${t.channel}`, String(t.channel),
      ...(t.strings||[])
    ].join(" ").toLowerCase();
    return blob.includes(q);
  });
  const html = filtered.map(t=>{
    const tkLabel = `TK${pad3(t.tk)}`;
    const sCount = (t.strings||[]).length;
    return `
      <div class="item" data-tk="${t.tk}">
        <div>
          <b>${tkLabel}</b> <small>• P${t.plataforma} • ID ${pad2(t.controlbox_id)} • CH ${t.channel}</small>
          <div class="hint">${sCount ? `${sCount} strings` : "sin strings"}</div>
        </div>
        <button data-action="open" data-tk="${t.tk}">Abrir</button>
      </div>
    `;
  }).join("");
  box.innerHTML = html || "<div class='hint'>Sin resultados para ese filtro.</div>";
}

// ---- Import/Export
function parseCSV(text){
  // Simple CSV parser for typical O&M datasets (no embedded newlines)
  // Supports commas or semicolons as delimiter when header contains commas.
  const lines = text.replace(/\r/g,"").split("\n").filter(l=>l.trim().length);
  if(!lines.length) return {headers:[], rows:[]};
  const delim = lines[0].includes(",") ? "," : (lines[0].includes(";") ? ";" : ",");
  const splitLine = (line) => {
    // basic quote handling
    const out = [];
    let cur = "", inQ = false;
    for(let i=0;i<line.length;i++){
      const ch = line[i];
      if(ch === '"'){ inQ = !inQ; continue; }
      if(ch === delim && !inQ){ out.push(cur); cur=""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map(s=>s.trim());
  };
  const headers = splitLine(lines[0]).map(normalizeHeaders);
  const rows = lines.slice(1).map(l=>{
    const vals = splitLine(l);
    const obj = {};
    headers.forEach((h,i)=> obj[h] = vals[i] ?? "");
    return obj;
  });
  return {headers, rows};
}

function coerceTrackerRow(row){
  // Accept multiple header variants
  const get = (...names) => {
    for(const n of names){
      const k = normalizeHeaders(n);
      if(row[k] !== undefined) return row[k];
    }
    return "";
  };
  const tk = parseInt(get("tk","tracker","tracker_fisico"),10);
  const plataforma = parseInt(get("plataforma","platform"),10);
  const controlbox = parseInt(get("controlbox_id","controlboxid","id_local","id_local/netid","id","netid"),10);
  const channel = parseInt(get("channel","canal","ch"),10);

  let stringsRaw = get("strings","ct_cb_st","ctcbst","string");
  let strings = [];
  if(stringsRaw){
    strings = String(stringsRaw).split(";").map(s=>normalizeCTCBST(s)).filter(Boolean);
  }

  // allow separate CT_CB_ST columns (ct_cb_st_1, ct_cb_st_2 ...) by scanning keys
  if(!strings.length){
    const candidates = Object.entries(row)
      .filter(([k,v])=> k.startsWith("ct_cb_st") || k.startsWith("ctcbst") || k.startsWith("string"))
      .map(([k,v])=> String(v||"").trim())
      .filter(Boolean)
      .map(normalizeCTCBST);
    if(candidates.length) strings = candidates;
  }

  if(!Number.isFinite(tk) || !Number.isFinite(plataforma) || !Number.isFinite(controlbox) || !Number.isFinite(channel)){
    return null;
  }
  const string_orders = strings.map((_,i)=> i+1);
  return { tk, plataforma, controlbox_id: controlbox, channel, strings, string_orders };
}

async function onImport(){
  const msg = $("#adminMsg");
  msg.textContent = "";
  if(!state.activePark){ msg.textContent = "Primero selecciona y carga un parque."; return; }

  const f = $("#fileImport").files?.[0];
  if(!f){ msg.textContent = "Selecciona un archivo CSV o JSON."; return; }

  const text = await f.text();
  let pack = null;

  if(f.name.toLowerCase().endsWith(".json")){
    try{
      pack = JSON.parse(text);
      if(Array.isArray(pack)) pack = {version:1, updated:"", trackers: pack};
      if(!pack.trackers) throw new Error("JSON sin 'trackers'");
    }catch(e){
      msg.textContent = "JSON inválido: " + e.message;
      return;
    }
  }else{
    const parsed = parseCSV(text);
    const trackers = [];
    for(const row of parsed.rows){
      const t = coerceTrackerRow(row);
      if(t) trackers.push(t);
    }
    pack = {version:1, updated:new Date().toISOString().slice(0,10), trackers};
  }

  // Deduplicate by tk within park
  const byTk = new Map();
  for(const t of pack.trackers){
    byTk.set(t.tk, t);
  }
  pack.trackers = Array.from(byTk.values()).sort((a,b)=>a.tk-b.tk);

  state.dataset = pack;
  await idb.set(`park:${state.activePark.id}`, pack);
  setPills();
  msg.textContent = `Importado: ${pack.trackers.length} trackers al parque ${state.activePark.name}.`;
  state.lastResult = null;
  renderMain();
}

function downloadBlob(filename, blob){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1500);
}

function exportJSON(){
  if(!state.activePark) return alert("Selecciona un parque.");
  const blob = new Blob([JSON.stringify(state.dataset,null,2)], {type:"application/json"});
  downloadBlob(`${state.activePark.id}_trackers.json`, blob);
}

function exportCSV(){
  if(!state.activePark) return alert("Selecciona un parque.");
  const header = ["TK","Plataforma","ControlBox_ID","Channel","Strings"];
  const lines = [header.join(",")];
  for(const t of (state.dataset.trackers||[])){
    const strings = (t.strings||[]).join(";");
    lines.push([t.tk, t.plataforma, t.controlbox_id, t.channel, `"${strings}"`].join(","));
  }
  const blob = new Blob([lines.join("\n")], {type:"text/csv"});
  downloadBlob(`${state.activePark.id}_trackers.csv`, blob);
}

async function onForgetPark(){
  const msg = $("#adminMsg");
  if(!state.activePark){ msg.textContent = "Selecciona un parque."; return; }
  await idb.del(`park:${state.activePark.id}`);
  msg.textContent = "Caché local borrada para " + state.activePark.name;
}

async function onResetEmpty(){
  const msg = $("#adminMsg");
  if(!state.activePark){ msg.textContent = "Selecciona un parque."; return; }
  const empty = {version:1, updated:new Date().toISOString().slice(0,10), trackers:[]};
  state.dataset = empty;
  await idb.set(`park:${state.activePark.id}`, empty);
  setPills();
  msg.textContent = "Parque reseteado (vacío): " + state.activePark.name;
  state.lastResult = null;
  renderMain();
}

// ---- Park loading
async function loadParks(){
  const res = await fetch("parks.json", {cache:"no-store"});
  state.parks = await res.json();
  const sel = $("#parkSelect");
  sel.innerHTML = state.parks.map(p=> `<option value="${p.id}">${p.name}</option>`).join("");
  // try restore last selected
  const last = localStorage.getItem("trackerid_lastPark");
  if(last && state.parks.some(p=>p.id===last)) sel.value = last;
  state.activePark = state.parks.find(p=>p.id === sel.value) || state.parks[0] || null;
}

async function loadActivePark(){
  if(!state.activePark) return;
  localStorage.setItem("trackerid_lastPark", state.activePark.id);

  // Prefer local cached pack
  const cached = await idb.get(`park:${state.activePark.id}`);
  if(cached){
    state.dataset = cached;
    setPills();
    state.lastResult = null;
    renderMain();
    // background refresh
    refreshFromNetwork().catch(()=>{});
    return;
  }
  // Else fetch default data
  await refreshFromNetwork(true);
}

async function refreshFromNetwork(showAlert=false){
  if(!state.activePark) return;
  try{
    const res = await fetch(state.activePark.data, {cache:"no-store"});
    if(!res.ok) throw new Error("HTTP "+res.status);
    const pack = await res.json();
    if(!pack.trackers) throw new Error("Pack sin 'trackers'");
    state.dataset = pack;
    await idb.set(`park:${state.activePark.id}`, pack);
    setPills();
    state.lastResult = null;
    renderMain();
    if(showAlert) toast("Parque cargado desde red.");
  }catch(e){
    if(showAlert) toast("No se pudo cargar desde red. Si ya lo cargaste antes, debería estar offline.");
  }
}

function toast(msg){
  // small non-intrusive toast
  const d = document.createElement("div");
  d.textContent = msg;
  d.style.position="fixed";
  d.style.left="50%";
  d.style.bottom="18px";
  d.style.transform="translateX(-50%)";
  d.style.background="#111";
  d.style.color="#fff";
  d.style.padding="10px 12px";
  d.style.borderRadius="999px";
  d.style.fontSize="13px";
  d.style.opacity="0";
  d.style.transition="opacity .18s ease";
  document.body.appendChild(d);
  requestAnimationFrame(()=> d.style.opacity="0.92");
  setTimeout(()=>{ d.style.opacity="0"; setTimeout(()=>d.remove(), 300); }, 1800);
}

// ---- Copy / Clear
function buildCopyText(res){
  if(!res || res.type==="not_found" || !res.tracker) return "";
  const t = res.tracker;
  const tkLabel = `TK${pad3(t.tk)}`;
  const cbLabel = `P${t.plataforma}-ID${pad2(t.controlbox_id)}`;
  const s = (t.strings||[]).join(", ");
  const hit = res.type==="string" ? `String: ${res.ct_cb_st}\n` : "";
  return `${state.activePark.name}\n${hit}${tkLabel} (Físico ${t.tk})\nPlataforma: ${t.plataforma}\nControlBox: ${cbLabel} (ID ${t.controlbox_id})\nChannel: ${t.channel}\nStrings: ${s}`;
}

async function onCopy(){
  const txt = buildCopyText(state.lastResult);
  if(!txt){ toast("Nada para copiar."); return; }
  try{
    await navigator.clipboard.writeText(txt);
    toast("Copiado al portapapeles.");
  }catch{
    // fallback
    const ta = document.createElement("textarea");
    ta.value = txt;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("Copiado.");
  }
}

function onClear(){
  state.lastResult = null;
  if(state.tab==="buscar"){
    $("#inTk").value="";
    $("#inPlat").value="";
    $("#inCb").value="";
    $("#inString").value="";
    $("#resultBox").innerHTML = renderResult(null);
  }else{
    renderMain();
  }
}

// ---- Network indicator
function updateNet(){
  const on = navigator.onLine;
  $("#dotNet").classList.toggle("ok", on);
  $("#netTxt").textContent = on ? "online" : "offline";
}
window.addEventListener("online", updateNet);
window.addEventListener("offline", updateNet);

// ---- Service worker
async function registerSW(){
  if("serviceWorker" in navigator){
    try{ await navigator.serviceWorker.register("./sw.js"); }catch{}
  }
}

// ---- Init
async function init(){
  updateNet();
  await registerSW();

  // Tabs
  $$(".tabs button").forEach(b=>{
    b.addEventListener("click", ()=> setTab(b.dataset.tab));
  });

  // Park controls
  $("#btnLoad").addEventListener("click", async ()=>{
    const id = $("#parkSelect").value;
    state.activePark = state.parks.find(p=>p.id===id) || null;
    await loadActivePark();
  });
  $("#parkSelect").addEventListener("change", ()=>{
    const id = $("#parkSelect").value;
    state.activePark = state.parks.find(p=>p.id===id) || null;
    setPills();
  });

  $("#btnCopy").addEventListener("click", onCopy);
  $("#btnClear").addEventListener("click", onClear);

  await loadParks();
  setPills();
  renderMain();
  // autoload last park
  await loadActivePark();
}

init();
