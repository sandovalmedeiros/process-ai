/**
 * scripts/docs-site/render/hierarquia-3d.ts — árvore 3D da hierarquia (Three.js).
 *
 * Visualização interativa da hierarquia de processos (Macro → Processo →
 * Subprocesso → Atividade → Tarefa) como cone-tree: raiz (M) no ápice, folhas
 * (T) na base; cada nível abre num leque angular proporcional ao nº de folhas.
 * Arraste para girar, scroll para zoom, touch p/ mobile. Rótulos em overlay HTML
 * projetados mundo→tela a cada frame.
 *
 * Degradação honesta: sem Three.js OU sem WebGL OU árvore vazia → revela o
 * fallback textual (lista aninhada renderizada server-side), que sempre está no
 * DOM. A hierarquia é legível mesmo sem acelerador gráfico.
 *
 * INVARIANTE AD-3: vive em scripts/.
 * Lib: three r137 (MIT, UMD global) — vendor/scripts/docs-site/vendor/three/0.137.0/three.min.js.
 *
 * Nota de pinning: o Three.js removeu o build UMD (`build/three.min.js`) em r160+
 * (passou a ESM-only). O requisito offline via `file://` exige um global UMD
 * (script defer + window.THREE dentro de DOMContentLoaded, igual ao d3). r137 é o
 * último build UMD limpo sem console.warn de deprecation; a API usada aqui
 * (Scene/Camera/WebGLRenderer/BoxGeometry/BufferGeometry/LineSegments/…) é
 * estável desde ~r100. Ver vendor/PROVENANCE.md.
 */
import { wrapPage, escapeHtml } from './page.ts';
import type { HierarchyTree, HierarchyNode } from '../extract.ts';

export interface Hierarquia3dInput {
  tree: HierarchyTree;
  /** SHA-256 curto do artefato de origem (hierarchy). */
  shaShort?: string;
  /** artifactType(s) de origem p/ o rodapé de rastreabilidade. */
  sourceTypes?: ReadonlyArray<string>;
}

const STYLE = `
#pa-stage{position:relative;width:100%;height:560px;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
#pa-canvas{display:block;width:100%;height:100%;cursor:grab;touch-action:none}
#pa-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.pa-label{position:absolute;top:0;left:0;font:12px/1.25 system-ui,sans-serif;color:#c9d1d9;background:rgba(22,27,34,.72);border:1px solid var(--line);border-radius:5px;padding:.08em .42em;white-space:nowrap;pointer-events:auto;will-change:transform;transform:translate(-50%,-50%);max-width:240px;overflow:hidden;text-overflow:ellipsis}
.pa-label.d0{font-weight:700;font-size:14px;background:rgba(67,56,202,.92);color:#fff;border-color:#4338ca}
.pa-label.d1{background:rgba(37,99,235,.88);color:#fff;border-color:#2563eb}
.pa-label.d2{background:rgba(13,148,136,.88);color:#fff;border-color:#0d9488}
.pa-label.d3{background:rgba(217,119,6,.9);color:#1f1205;border-color:#d97706}
.pa-label.d4{font-size:11px}
.pa-legend{display:flex;gap:1rem;flex-wrap:wrap;margin-top:.8rem;font-size:.85rem;color:var(--muted)}
.pa-legend span{display:inline-flex;align-items:center;gap:.4rem}
.pa-sq{width:12px;height:12px;border-radius:3px;display:inline-block}
.pa-sq.d0{background:#4338ca}.pa-sq.d1{background:#2563eb}.pa-sq.d2{background:#0d9488}.pa-sq.d3{background:#d97706}.pa-sq.d4{background:#64748b}
.pa-hint{margin-top:.6rem;font-size:.82rem;color:var(--muted)}
.pa-fallback{margin-top:1rem}
.pa-tree,.pa-tree ul{list-style:none;padding-left:1.1rem;margin:.4rem 0}
.pa-tree>li{margin:.12rem 0}
.pa-tree .pa-id{color:var(--muted);font-family:ui-monospace,SFMono-Regular,monospace;font-size:.85em;margin-right:.4rem}
@media (prefers-color-scheme: light){
  .pa-label{color:#1f2328;background:rgba(255,255,255,.9)}
  .pa-label.d0,.pa-label.d1,.pa-label.d2{color:#fff}
  .pa-tree .pa-id{color:#57606a}
}
`;

/** Contagem de nós por nível (legenda). */
function levelCounts(tree: HierarchyTree): Record<string, number> {
  const c: Record<string, number> = { M: 0, E: 0, S: 0, A: 0, T: 0 };
  for (const n of tree.nodes) c[n.level] = (c[n.level] ?? 0) + 1;
  return c;
}

/** Lista aninhada (fallback textual) renderizada server-side — sempre no DOM. */
function renderFallbackTree(tree: HierarchyTree): string {
  const kids = new Map<string, HierarchyNode[]>();
  for (const n of tree.nodes) {
    if (n.parentId) {
      const arr = kids.get(n.parentId) ?? [];
      arr.push(n);
      kids.set(n.parentId, arr);
    }
  }
  const renderNode = (n: HierarchyNode): string => {
    const childIds = kids.get(n.id) ?? [];
    const head = `<span class="pa-id">${escapeHtml(n.id)}</span>${escapeHtml(n.label)} <span class="tag">${escapeHtml(n.levelName)}</span>`;
    return `<li>${head}${childIds.length ? `<ul>${childIds.map(renderNode).join('')}</ul>` : ''}</li>`;
  };
  const roots = tree.rootIds
    .map((id) => tree.nodes.find((n) => n.id === id))
    .filter((n): n is HierarchyNode => Boolean(n));
  if (!roots.length && tree.nodes.length) {
    // Órfãos (sem pai resolvido) — mostra todos em ordem de documento.
    return `<ul class="pa-tree">${tree.nodes
      .map((n) => `<li><span class="pa-id">${escapeHtml(n.id)}</span>${escapeHtml(n.label)} <span class="tag">${escapeHtml(n.levelName)}</span></li>`)
      .join('')}</ul>`;
  }
  return `<ul class="pa-tree">${roots.map(renderNode).join('')}</ul>`;
}

export function renderHierarchy3dPage(input: Hierarquia3dInput): string {
  const n = input.tree.nodes.length;
  const c = levelCounts(input.tree);
  const sources =
    input.sourceTypes && input.sourceTypes.length ? input.sourceTypes.join(', ') : 'hierarchy';
  const shaLine = input.shaShort ? ` · rastreabilidade <code>${escapeHtml(input.shaShort)}</code>` : '';
  const fbTree = renderFallbackTree(input.tree);

  const body = `
<h1>Hierarquia 3D</h1>
<p class="muted">Árvore interativa da hierarquia de processos (Macro → Processo → Subprocesso → Atividade → Tarefa). <strong>${n}</strong> nós. Arraste para girar, scroll para zoom. Fonte: <span class="tag">${escapeHtml(sources)}</span>${shaLine}.</p>
<style>${STYLE}</style>
<div id="pa-stage" role="img" aria-label="Árvore 3D da hierarquia de processos">
  <canvas id="pa-canvas"></canvas>
  <div id="pa-labels"></div>
</div>
<div class="pa-legend">
  <span><i class="pa-sq d0"></i> Macroprocesso (${c.M})</span>
  <span><i class="pa-sq d1"></i> Processo (${c.E})</span>
  <span><i class="pa-sq d2"></i> Subprocesso (${c.S})</span>
  <span><i class="pa-sq d3"></i> Atividade (${c.A})</span>
  <span><i class="pa-sq d4"></i> Tarefa (${c.T})</span>
</div>
<p class="pa-hint">Arraste para girar · scroll para zoom · passe o mouse num rótulo para ver o ID e o pai.</p>
<div id="pa-fallback" class="pa-fallback" style="display:none">
  <p class="pa-fb-msg muted">Visualização 3D indisponível — hierarquia em texto:</p>
  ${fbTree}
</div>`;

  // Three.js r137 UMD global. DOMContentLoaded é OBRIGATÓRIO: three vem num
  // <script defer>, que roda só após o parse (antes do DOMContentLoaded). O
  // global `THREE` só existe dentro deste callback. Degrada graciosamente se a
  // lib não carregar ou se WebGL estiver indisponível (revela o fallback).
  const script = `window.addEventListener('DOMContentLoaded', function(){
  var data = JSON.parse(document.getElementById('pa-data').textContent);
  var THREE = window.THREE;
  var stage = document.getElementById('pa-stage');
  var canvas = document.getElementById('pa-canvas');
  var labelsLayer = document.getElementById('pa-labels');
  var fb = document.getElementById('pa-fallback');
  function showFallback(msg){
    if (msg){ var m = fb && fb.querySelector('.pa-fb-msg'); if (m) m.textContent = msg; }
    if (fb) fb.style.display = 'block';
    if (stage) stage.style.display = 'none';
  }
  if (!THREE) { showFallback('Biblioteca Three.js não carregada (abra via file:// após gerar o site).'); return; }
  if (!data.nodes || !data.nodes.length) { showFallback('Sem hierarquia mapeada — gere o artefato hierarchy na pipeline.'); return; }
  var renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); }
  catch (e) { showFallback('WebGL indisponível neste navegador.'); return; }

  var nodes = data.nodes, rootIds = data.rootIds || [];
  var byId = {}, kids = {};
  for (var i=0;i<nodes.length;i++){ var nd=nodes[i]; byId[nd.id]=nd; kids[nd.id]=[]; }
  for (i=0;i<nodes.length;i++){ var nd=nodes[i]; if (nd.parentId && byId[nd.parentId]) kids[nd.parentId].push(nd); }

  var leafCount = {};
  function lc(id){
    if (leafCount[id]!==undefined) return leafCount[id];
    var ch = kids[id]||[];
    if (!ch.length){ leafCount[id]=1; return 1; }
    var s=0; for (var j=0;j<ch.length;j++) s+=lc(ch[j].id);
    leafCount[id]=s; return s;
  }
  for (i=0;i<nodes.length;i++) lc(nodes[i].id);

  var maxDepth = 0;
  for (i=0;i<nodes.length;i++) if (nodes[i].depth>maxDepth) maxDepth=nodes[i].depth;
  if (maxDepth<1) maxDepth=1;

  var LEVEL_H = 2.6, RADIUS = 2.4;
  var pos = {}, angles = {};
  function assignAngle(id, aStart, aSpan){
    angles[id] = aStart + aSpan/2;
    var ch = kids[id]||[];
    if (!ch.length) return;
    var tot=0; for (var j=0;j<ch.length;j++) tot+=leafCount[ch[j].id];
    var cursor=aStart;
    for (j=0;j<ch.length;j++){ var sp=aSpan*(leafCount[ch[j].id]/tot); assignAngle(ch[j].id, cursor, sp); cursor+=sp; }
  }
  if (rootIds.length){
    var totR=0; for (j=0;j<rootIds.length;j++) totR+=leafCount[rootIds[j]];
    var cR=0;
    for (j=0;j<rootIds.length;j++){ var sp=(2*Math.PI)*(leafCount[rootIds[j]]/totR); assignAngle(rootIds[j], cR, sp); cR+=sp; }
  }
  for (i=0;i<nodes.length;i++){
    var nd=nodes[i], d=nd.depth, r=d*RADIUS;
    if (d===0 && rootIds.length>1) r=RADIUS*0.6;
    var a = (angles[nd.id]===undefined)?0:angles[nd.id];
    pos[nd.id] = { x: Math.cos(a)*r, y: (maxDepth-d)*LEVEL_H, z: Math.sin(a)*r };
  }

  var scene = new THREE.Scene();
  var centerY = (maxDepth*LEVEL_H)/2;
  var camDist = maxDepth*RADIUS + 14;
  var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, centerY, camDist);
  camera.lookAt(0, centerY, 0);
  var group = new THREE.Group();
  scene.add(group);

  function resize(){
    var w = stage.clientWidth, h = stage.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w/h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  var DEPTH_COLOR = [0x4338ca, 0x2563eb, 0x0d9488, 0xd97706, 0x64748b];
  var DEPTH_SIZE  = [1.8, 1.4, 1.1, 0.85, 0.65];
  var meshes = {};
  for (i=0;i<nodes.length;i++){
    var nd=nodes[i], d=Math.min(nd.depth,4), s=DEPTH_SIZE[d];
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(s,s,s), new THREE.MeshBasicMaterial({ color: DEPTH_COLOR[d] }));
    var p = pos[nd.id]; mesh.position.set(p.x, p.y, p.z);
    group.add(mesh); meshes[nd.id]=mesh;
  }
  var edgePts = [];
  for (i=0;i<nodes.length;i++){
    var nd=nodes[i]; if (!nd.parentId) continue;
    var pp=pos[nd.parentId], pc=pos[nd.id]; if (!pp||!pc) continue;
    edgePts.push(pp.x,pp.y,pp.z, pc.x,pc.y,pc.z);
  }
  if (edgePts.length){
    var eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.Float32BufferAttribute(edgePts, 3));
    group.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x8b949e, transparent: true, opacity: 0.5 })));
  }

  var labelEls = {};
  for (i=0;i<nodes.length;i++){
    var nd=nodes[i];
    var div = document.createElement('div');
    div.className = 'pa-label d'+Math.min(nd.depth,4);
    div.textContent = nd.label;
    div.title = nd.id + ' · ' + nd.levelName + (nd.parentId ? ' · pai: ' + nd.parentId : '');
    labelsLayer.appendChild(div); labelEls[nd.id]=div;
  }

  var yaw=0.6, pitch=-0.35;
  group.rotation.y=yaw; group.rotation.x=pitch;
  var isDown=false, lx=0, ly=0;
  canvas.addEventListener('mousedown', function(e){ isDown=true; lx=e.clientX; ly=e.clientY; canvas.style.cursor='grabbing'; });
  window.addEventListener('mouseup', function(){ isDown=false; canvas.style.cursor='grab'; });
  window.addEventListener('mousemove', function(e){
    if(!isDown) return;
    var dx=e.clientX-lx, dy=e.clientY-ly;
    yaw += dx*0.006; pitch += dy*0.006;
    if (pitch>1.3) pitch=1.3; if (pitch<-1.3) pitch=-1.3;
    group.rotation.y=yaw; group.rotation.x=pitch; lx=e.clientX; ly=e.clientY;
  });
  canvas.addEventListener('wheel', function(e){
    e.preventDefault();
    var f = e.deltaY>0 ? 1.08 : 0.92;
    camera.position.multiplyScalar(f);
    var dist = camera.position.length();
    if (dist<6) camera.position.multiplyScalar(6/dist);
    if (dist>80) camera.position.multiplyScalar(80/dist);
  }, { passive:false });
  var tDown=false, tx=0, ty=0;
  canvas.addEventListener('touchstart', function(e){ if(e.touches.length===1){ tDown=true; tx=e.touches[0].clientX; ty=e.touches[0].clientY; } }, {passive:true});
  canvas.addEventListener('touchmove', function(e){
    if(!tDown||e.touches.length!==1) return;
    if(e.cancelable) e.preventDefault();
    var dx=e.touches[0].clientX-tx, dy=e.touches[0].clientY-ty;
    yaw+=dx*0.006; pitch+=dy*0.006;
    if(pitch>1.3)pitch=1.3; if(pitch<-1.3)pitch=-1.3;
    group.rotation.y=yaw; group.rotation.x=pitch; tx=e.touches[0].clientX; ty=e.touches[0].clientY;
  }, {passive:false});
  canvas.addEventListener('touchend', function(){ tDown=false; }, {passive:true});
  canvas.style.cursor='grab';

  var tmp = new THREE.Vector3();
  function frame(){
    camera.lookAt(0, centerY, 0);
    renderer.render(scene, camera);
    var w = stage.clientWidth, h = stage.clientHeight;
    for (var id in labelEls){
      var mesh = meshes[id]; if(!mesh) continue;
      mesh.getWorldPosition(tmp); tmp.project(camera);
      var el = labelEls[id];
      if (tmp.z>1 || tmp.z<-1){ el.style.display='none'; continue; }
      el.style.display='';
      var sx=(tmp.x*0.5+0.5)*w, sy=(-tmp.y*0.5+0.5)*h;
      el.style.transform='translate(-50%,-50%) translate('+sx+'px,'+sy+'px)';
    }
    requestAnimationFrame(frame);
  }
  frame();
});`;

  return wrapPage({
    title: 'Hierarquia 3D',
    bodyHtml: body,
    vendorDeps: ['three/0.137.0/three.min.js'],
    embeddedData: input.tree,
    pageScript: script,
    description: 'Visualização 3D interativa da hierarquia de processos (Macro → Tarefa).',
  });
}
