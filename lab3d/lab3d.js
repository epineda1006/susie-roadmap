/* Susie's Pathology Lab: 3D models, one per topic.
   Built with three.js (MIT, vendored next to this file). Shapes follow published measurements where they exist:
   the red cell outline uses the Evans and Fung (1972) equation, the DNA uses standard B-DNA spacing
   (3.38 angstrom rise, 10.5 base pairs a turn). Colors follow H&E stain, the pink and purple of real slides. */
import * as THREE from './three.module.min.js';

/* ---------- Small helpers ---------- */
function rngF(seed) { var s = seed % 2147483647; if (s <= 0) s += 2147483646; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

/* Smooth 3D gradient noise (Perlin), so surfaces bulge softly instead of looking faceted */
var PERM = (function () { var p = [], r = rngF(1234), i; for (i = 0; i < 256; i++) p[i] = i; for (i = 255; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = p[i]; p[i] = p[j]; p[j] = t; } return p.concat(p); })();
var GR = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function grad(h, x, y, z) { var g = GR[h % 12]; return g[0] * x + g[1] * y + g[2] * z; }
function noise(x, y, z) {
  var X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z); x -= X; y -= Y; z -= Z; X &= 255; Y &= 255; Z &= 255;
  var u = fade(x), v = fade(y), w = fade(z), P = PERM;
  var A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
  function L(a, b, t) { return a + (b - a) * t; }
  return L(L(L(grad(P[AA], x, y, z), grad(P[BA], x - 1, y, z), u), L(grad(P[AB], x, y - 1, z), grad(P[BB], x - 1, y - 1, z), u), v),
           L(L(grad(P[AA + 1], x, y, z - 1), grad(P[BA + 1], x - 1, y, z - 1), u), L(grad(P[AB + 1], x, y - 1, z - 1), grad(P[BB + 1], x - 1, y - 1, z - 1), u), v), w);
}
function fbm(x, y, z, oct) { var s = 0, a = .5, f = 1; for (var i = 0; i < (oct || 3); i++) { s += a * noise(x * f, y * f, z * f); a *= .5; f *= 2.03; } return s; }

/* Weld matching corners so normals are shared and the surface shades smooth */
function weld(geo) {
  var g = geo.index ? geo.toNonIndexed() : geo, pos = g.attributes.position, map = {}, verts = [], idx = [];
  for (var i = 0; i < pos.count; i++) {
    var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = Math.round(x * 1e4) + '_' + Math.round(y * 1e4) + '_' + Math.round(z * 1e4);
    if (map[k] === undefined) { map[k] = verts.length / 3; verts.push(x, y, z); }
    idx.push(map[k]);
  }
  var out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); out.setIndex(idx);
  return out;
}
/* A soft lumpy ball: radius r, bumps of size amp at frequency fq, stretched by sx, sy, sz */
function blob(r, amp, fq, seed, det, sx, sy, sz) {
  var g = weld(new THREE.IcosahedronGeometry(1, det || 24)), p = g.attributes.position, v = new THREE.Vector3(), o = seed * 7.13;
  for (var i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    var d = r * (1 + amp * fbm(v.x * fq + o, v.y * fq + o * .7, v.z * fq - o, 3));
    p.setXYZ(i, v.x * d * (sx || 1), v.y * d * (sy || 1), v.z * d * (sz || 1));
  }
  g.computeVertexNormals(); return g;
}
/* Sweep a circle along a path; rad(t) sets the thickness, flat squashes it into a ribbon */
function sweep(path, rad, segs, radial, flat) {
  var pos = [], idx = [], P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (var i = 0; i <= segs; i++) {
    var t = i / segs; path(t, P); path(Math.min(1, t + 1e-3), a); path(Math.max(0, t - 1e-3), b); T.subVectors(a, b).normalize();
    if (Math.abs(T.dot(up)) > .95) up.set(1, 0, 0);
    N.crossVectors(T, up).normalize(); B.crossVectors(T, N).normalize();
    var r = rad(t);
    for (var j = 0; j < radial; j++) {
      var th = j / radial * Math.PI * 2, c = Math.cos(th) * r, s = Math.sin(th) * r * (flat || 1);
      pos.push(P.x + N.x * c + B.x * s, P.y + N.y * c + B.y * s, P.z + N.z * c + B.z * s);
    }
  }
  for (i = 0; i < segs; i++) for (var j2 = 0; j2 < radial; j2++) {
    var q = i * radial + j2, q2 = i * radial + (j2 + 1) % radial;
    idx.push(q, q + radial, q2, q2, q + radial, q2 + radial);
  }
  var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function curvePath(pts, closed) { var c = new THREE.CatmullRomCurve3(pts, !!closed, 'centripetal'); return function (t, out) { c.getPoint(t, out); }; }

/* ---------- Materials ---------- */
var CLIP = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10), LCLIP = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10);
function M(o) {
  var m = new THREE.MeshPhysicalMaterial({
    color: o.c, roughness: o.r == null ? .45 : o.r, metalness: 0, clearcoat: o.cc == null ? .35 : o.cc, clearcoatRoughness: .3,
    sheen: o.sh == null ? .6 : o.sh, sheenRoughness: .5, sheenColor: new THREE.Color(o.shc || 0xffffff),
    transparent: o.op != null && o.op < 1, opacity: o.op == null ? 1 : o.op, depthWrite: !(o.op != null && o.op < 1),
    side: o.ds ? THREE.DoubleSide : THREE.FrontSide, emissive: 0x000000
  });
  if (o.cut) m.clippingPlanes = [CLIP];
  m.userData.part = o.p; m.userData.base = new THREE.Color(o.c);
  return m;
}
function mesh(g, m, parent) { var x = new THREE.Mesh(g, m); parent.add(x); return x; }
function inst(g, m, n, parent) { var x = new THREE.InstancedMesh(g, m, n); x.instanceMatrix.setUsage(THREE.StaticDrawUsage); parent.add(x); return x; }
var _o = new THREE.Object3D();
function put(im, i, x, y, z, rx, ry, rz, s, sy, sz) { _o.position.set(x, y, z); _o.rotation.set(rx || 0, ry || 0, rz || 0); _o.scale.set(s, sy == null ? s : sy, sz == null ? s : sz); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix); }
/* random point inside a ball of radius r */
function inBall(R, r, out) { var u, v, w; do { u = R() * 2 - 1; v = R() * 2 - 1; w = R() * 2 - 1; } while (u * u + v * v + w * w > 1); out.set(u * r, v * r, w * r); return out; }

/* ---------- H&E palette ---------- */
var C = {
  memb: 0xF4A6C6, cyto: 0xF7C3D7, nuc: 0x4B2C8C, nucCa: 0x2E1666, nucl: 0x1A0B33, chrom: 0x2B1450, mito: 0xC2185B, er: 0xE86FA4, golgi: 0xF0B429,
  rbc: 0xC62828, rbcS: 0xB71C1C, wbcM: 0xEADCF5, wbcN: 0x5E35B1, gran: 0xE57373, lymN: 0x311B92, plt: 0xB39DDB,
  corn: 0xF8BBD0, gran2: 0xCE93D8, spin: 0xF48FB1, basal: 0xEC407A, bmem: 0xFFE082, derm: 0xF8D7E3, coll: 0xF06292, cap: 0xD32F2F, kN: 0x4527A0,
  bb: 0xE0E6F0, at: 0x29B6F6, ta: 0xFFB300, gc: 0x7E57C2, cg: 0x66BB6A, mut: 0xFF1744,
  env: 0xFFCCBC, ha: 0x26A69A, na: 0xFFA726, rnp: 0x5C6BC0, m1: 0xFFAB91,
  imem: 0x90CAF9, pg: 0x7E57C2, omem: 0xF48FB1, ribo: 0x4DB6AC, nucleoid: 0x1565C0, flag: 0xBDBDBD,
  lam: 0xF3E5D0, lam2: 0xE9D6BA, hav: 0xD84343, nerve: 0xFBC02D, ocyte: 0x6D4C41, cana: 0x8D6E63, cement: 0xC8B79A
};

/* ================= Models ================= */
var BUILD = {};

/* ----- Cancer: a normal cell and a cancer cell, cut open ----- */
BUILD.cancer = function (g, variant) {
  var ca = variant === 'cancer', R = rngF(ca ? 31 : 7), v = new THREE.Vector3();
  mesh(blob(1.6, ca ? .16 : .06, ca ? 1.7 : 1.2, ca ? 3 : 1, 28, 1.08, .92, 1), M({ c: C.memb, op: .26, r: .25, cc: 1, sh: 1, shc: 0xffe0ee, ds: true, cut: true, p: 'membrane' }), g);
  mesh(blob(1.52, ca ? .14 : .05, ca ? 1.7 : 1.2, ca ? 3 : 1, 20, 1.08, .92, 1), M({ c: C.cyto, op: .1, r: .6, cc: 0, sh: 0, ds: true, cut: true, p: 'membrane' }), g);
  var nr = ca ? .92 : .55, ng = blob(nr, ca ? .2 : .05, ca ? 2.2 : 1.5, ca ? 9 : 2, 26, 1.12, .95, 1);
  var nuc = mesh(ng, M({ c: ca ? C.nucCa : C.nuc, r: .5, cc: .4, sh: .8, shc: 0xb39ddb, cut: true, ds: true, p: 'nucleus' }), g);
  nuc.position.set(ca ? .12 : .05, .02, 0);
  /* nucleoli: one small in normal, several big in cancer */
  var nn = ca ? 3 : 1;
  for (var i = 0; i < nn; i++) { var nl = mesh(blob(ca ? .2 - i * .03 : .13, .1, 2, i + 4, 14), M({ c: C.nucl, r: .3, cc: .6, sh: .4, p: 'nucleoli' }), g); nl.position.set(nuc.position.x + (ca ? [-.25, .3, .05][i] : .08), [.15, -.2, .3][i] || .1, [.1, .2, -.25][i] || .05); }
  /* chromatin: fine in normal, coarse clumps in cancer */
  var nc = ca ? 70 : 140, cg = blob(1, .3, 3, 5, 6), cm = inst(cg, M({ c: C.chrom, r: .6, cc: 0, sh: .3, p: 'chromatin' }), nc, g);
  for (i = 0; i < nc; i++) { inBall(R, nr * .82, v); var s = ca ? .05 + R() * .07 : .025 + R() * .02; put(cm, i, v.x + nuc.position.x, v.y, v.z, R() * 6, R() * 6, 0, s); }
  /* mitochondria: bean shapes with an inner fold line */
  var mg = new THREE.CapsuleGeometry(.07, .2, 8, 18), mm = inst(mg, M({ c: C.mito, r: .35, cc: .8, sh: .5, p: 'mito' }), ca ? 26 : 18, g);
  for (i = 0; i < mm.count; i++) { do { inBall(R, 1.35, v); } while (v.distanceTo(nuc.position) < nr * 1.25); put(mm, i, v.x * 1.05, v.y * .9, v.z, R() * 6, R() * 6, R() * 6, 1, 1 + R() * .5, 1); }
  /* rough ER: folded sheets wrapped around the nucleus */
  var erm = M({ c: C.er, r: .5, cc: .2, sh: .6, ds: true, p: 'er' });
  for (i = 0; i < 4; i++) {
    var rr = nr * 1.3 + i * .09, a0 = -1.2 + i * .1;
    mesh(sweep(function (t, o) { var a = a0 + t * 2.6; o.set(Math.cos(a) * rr + nuc.position.x, Math.sin(t * 9 + i) * .05, Math.sin(a) * rr); }, function (t) { return .055 * Math.sin(Math.PI * t) + .01; }, 80, 10, .25), erm, g).rotation.x = .5 - i * .25;
  }
  /* Golgi: a stack of curved discs */
  var gm = M({ c: C.golgi, r: .4, cc: .5, sh: .6, ds: true, p: 'golgi' }), gs = new THREE.Group(); g.add(gs);
  for (i = 0; i < 5; i++) {
    var L = .55 - Math.abs(i - 2) * .08, k = i;
    mesh(sweep(function (t, o) { var a = (t - .5) * L * 2.2; o.set(Math.sin(a) * (.9 + k * .07) - .9, k * .055, Math.cos(a) * (.9 + k * .07) - .9); }, function (t) { return .04 * Math.pow(Math.sin(Math.PI * t), .5) + .008; }, 40, 10, .35), gm, gs);
  }
  gs.position.set(-1.0, .5, .5); gs.rotation.set(.4, .8, .2);
  if (ca) { /* blebs on the surface of the cancer cell */
    var bg = blob(1, .15, 2, 8, 10), bm = inst(bg, M({ c: C.memb, op: .3, r: .25, cc: 1, sh: 1, ds: true, cut: true, p: 'membrane' }), 9, g);
    for (i = 0; i < 9; i++) { v.set(R() - .5, R() - .5, R() - .5).normalize().multiplyScalar(1.62); put(bm, i, v.x * 1.06, v.y * .9, v.z, 0, 0, 0, .18 + R() * .14); }
  }
};

/* ----- Blood: red cells (Evans and Fung shape), a neutrophil, a lymphocyte, platelets ----- */
function rbcGeo() {
  /* Evans and Fung 1972: z = (D/2) sqrt(1 - p^2) (C0 + C2 p^2 + C4 p^4), p = 2r/D, D = 7.82 um */
  var D = 1, C0 = .0518, C2 = 2.0026, C4 = -4.491, top = [], n = 48, i;
  for (i = 0; i <= n; i++) { var p = Math.sin(i / n * Math.PI / 2), z = D / 2 * Math.sqrt(Math.max(0, 1 - p * p)) * (C0 + C2 * p * p + C4 * p * p * p * p); top.push(new THREE.Vector2(p * D / 2, z)); }
  var pts = []; for (i = top.length - 1; i >= 0; i--) pts.push(new THREE.Vector2(Math.max(top[i].x, 1e-4), Math.max(top[i].y, .004)));
  for (i = 1; i < top.length; i++) pts.push(new THREE.Vector2(Math.max(top[i].x, 1e-4), -Math.max(top[i].y, .004)));
  pts.reverse();
  var g = new THREE.LatheGeometry(pts, 72); g.rotateX(Math.PI / 2); return g;
}
function sickleGeo() {
  return sweep(function (t, o) { var a = (t - .5) * 2.6; o.set(Math.sin(a) * .55, Math.cos(a) * .55 - .45, 0); }, function (t) { return .14 * Math.pow(Math.sin(Math.PI * t), .7) + .006; }, 64, 24, .45);
}
BUILD.blood = function (g, variant) {
  var R = rngF(variant === 'sickle' ? 19 : 13), sick = variant === 'sickle', rg = rbcGeo(), sg = sickleGeo();
  var rm = M({ c: C.rbc, r: .32, cc: .9, sh: .7, shc: 0xff8a80, p: 'rbc' });
  var spots = [[-1.6, .9, .2], [-.5, 1.4, -.6], [.8, 1.25, .3], [1.75, .35, -.3], [1.4, -.9, .5], [.2, -1.45, -.2], [-1.1, -1.05, .45], [-1.95, -.2, -.5], [2.1, 1.3, -.9], [-2.2, 1.5, -1], [.1, .35, -1.4], [-.6, -.1, 1.25]];
  var nr = spots.length, ns = sick ? 5 : 0, rmesh = inst(rg, rm, nr - ns, g), smesh = sick ? inst(sg, M({ c: C.rbcS, r: .35, cc: .9, sh: .7, shc: 0xff8a80, p: 'sickle' }), ns, g) : null, ri = 0, si = 0;
  spots.forEach(function (s, i) {
    var sc = 1.15 + R() * .12;
    if (sick && i % 2 === 1 && si < ns) put(smesh, si++, s[0], s[1], s[2], R() * 3, R() * 3, R() * 3, sc);
    else put(rmesh, ri++, s[0], s[1], s[2], R() * 3, R() * 3, R() * 3, sc);
  });
  /* neutrophil: clear cell, nucleus in 3 to 4 lobes joined by thin threads, pink granules */
  var ne = new THREE.Group(); g.add(ne); ne.position.set(-.3, .2, .4);
  mesh(blob(.78, .06, 2.5, 4, 22), M({ c: C.wbcM, op: .32, r: .3, cc: 1, sh: 1, ds: true, cut: true, p: 'neutrophil' }), ne);
  var lobes = [[-.3, .12, 0], [-.05, -.18, .1], [.25, -.05, -.05], [.32, .28, .08]], nm = M({ c: C.wbcN, r: .45, cc: .5, sh: .8, shc: 0xb39ddb, p: 'neutrophil' });
  lobes.forEach(function (l, i) { mesh(blob(.19, .1, 2.2, 10 + i, 12, 1.1, .9, .85), nm, ne).position.set(l[0], l[1], l[2]); });
  for (var i = 0; i < 3; i++) { var a = lobes[i], b = lobes[i + 1]; mesh(sweep(curvePath([new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + .05, (a[2] + b[2]) / 2), new THREE.Vector3(b[0], b[1], b[2])]), function () { return .045; }, 16, 8), nm, ne); }
  var gr = inst(new THREE.IcosahedronGeometry(.022, 2), M({ c: C.gran, r: .4, cc: .4, sh: .3, p: 'neutrophil' }), 110, ne), v = new THREE.Vector3();
  for (i = 0; i < 110; i++) { do { inBall(R, .68, v); } while (lobes.some(function (l) { return v.distanceTo(new THREE.Vector3(l[0], l[1], l[2])) < .2; })); put(gr, i, v.x, v.y, v.z, 0, 0, 0, 1); }
  /* lymphocyte: a big round nucleus with a thin rim of blue cytoplasm */
  var ly = new THREE.Group(); g.add(ly); ly.position.set(1.0, -.25, -.7);
  mesh(blob(.5, .04, 2, 6, 18), M({ c: 0xBBDEFB, op: .35, r: .3, cc: 1, sh: 1, ds: true, cut: true, p: 'lymph' }), ly);
  mesh(blob(.42, .05, 2.5, 7, 18), M({ c: C.lymN, r: .5, cc: .4, sh: .8, shc: 0x9fa8da, p: 'lymph' }), ly).position.set(.04, .02, 0);
  /* platelets: small purple discs */
  var pm = inst(blob(1, .2, 2, 12, 8, 1, .45, 1), M({ c: C.plt, r: .4, cc: .5, sh: .6, p: 'plt' }), 7, g);
  [[-1.5, -1.6, .9], [-.9, 1.75, .6], [1.6, 1.65, .2], [2.3, -.6, .1], [.7, -1.9, .8], [-2.4, .5, .4], [.05, 1.9, .9]].forEach(function (p, i) { put(pm, i, p[0], p[1], p[2], R() * 3, R() * 3, R() * 3, .14 + R() * .05); });
};

/* ----- Tissue basics: a block of skin, from the dead top layer down to the dermis ----- */
BUILD.tissue = function (g) {
  var R = rngF(41), W = 3.6, Dp = 2.2, v = new THREE.Vector3();
  function wave(x, z) { return .16 * Math.sin(x * 2.6) * Math.cos(z * 2.2) + .05 * noise(x * 2, 0, z * 2); }
  var top = 1.25;
  /* stratum corneum: flat wavy sheets */
  var cm = M({ c: C.corn, r: .5, cc: .5, sh: .7, cut: true, p: 'corneum' });
  for (var k = 0; k < 4; k++) {
    var pg = new THREE.PlaneGeometry(W, Dp, 60, 36); pg.rotateX(-Math.PI / 2); var p = pg.attributes.position;
    for (var i = 0; i < p.count; i++) { var x = p.getX(i), z = p.getZ(i); p.setY(i, top - k * .055 + .03 * noise(x * 3 + k, k, z * 3)); }
    pg.computeVertexNormals(); var sl = mesh(pg, cm, g); sl.material.side = THREE.DoubleSide;
  }
  /* living cell layers: granular (flat), spinous (many-sided), basal (tall columns), each with a nucleus */
  var layers = [
    { y: top - .32, n: [11, 7], s: [.17, .06, .15], c: C.gran2, nc: C.kN, part: 'granular', ns: .045 },
    { y: top - .62, n: [10, 6], s: [.17, .14, .17], c: C.spin, nc: C.kN, part: 'spinous', ns: .055 },
    { y: top - .9, n: [10, 6], s: [.17, .14, .17], c: C.spin, nc: C.kN, part: 'spinous', ns: .055 },
    { y: top - 1.2, n: [14, 8], s: [.11, .19, .11], c: C.basal, nc: C.nucCa, part: 'basal', ns: .065 }
  ];
  var cellG = blob(1, .12, 1.6, 21, 5), nucG = blob(1, .08, 2, 22, 3);
  layers.forEach(function (L) {
    var cnt = L.n[0] * L.n[1], cellM = inst(cellG, M({ c: L.c, r: .45, cc: .3, sh: .7, cut: true, p: L.part }), cnt, g), nM = inst(nucG, M({ c: L.nc, r: .5, cc: .3, sh: .5, cut: true, p: L.part }), cnt, g), i2 = 0;
    for (var a = 0; a < L.n[0]; a++) for (var b = 0; b < L.n[1]; b++) {
      var x = -W / 2 + (a + .5 + (b % 2) * .4) * W / L.n[0] + (R() - .5) * .05, z = -Dp / 2 + (b + .5) * Dp / L.n[1], y = L.y + wave(x, z) * (L.part === 'basal' ? 1 : .5);
      if (x > W / 2 - .05) x -= W / L.n[0] * .5;
      put(cellM, i2, x, y, z, 0, R(), 0, L.s[0] * (1 + (R() - .5) * .15), L.s[1], L.s[2]);
      put(nM, i2, x, y + (L.part === 'basal' ? -.03 : 0), z, 0, R(), 0, L.ns, L.part === 'granular' ? L.ns * .6 : L.ns, L.ns); i2++;
    }
  });
  /* basement membrane: a thin wavy sheet under the basal cells */
  var bm = new THREE.PlaneGeometry(W, Dp, 80, 50); bm.rotateX(-Math.PI / 2); p = bm.attributes.position;
  for (i = 0; i < p.count; i++) { x = p.getX(i); z = p.getZ(i); p.setY(i, top - 1.43 + wave(x, z)); } bm.computeVertexNormals();
  mesh(bm, M({ c: C.bmem, r: .4, cc: .6, sh: .4, ds: true, cut: true, p: 'bmem' }), g);
  /* dermis: pale pink ground with wavy collagen bundles and capillary loops */
  var dg = new THREE.BoxGeometry(W, 1.2, Dp, 40, 8, 24), dp = dg.attributes.position;
  for (i = 0; i < dp.count; i++) { if (dp.getY(i) > .5) { x = dp.getX(i); z = dp.getZ(i); dp.setY(i, .6 + wave(x, z) - .03); } } dg.computeVertexNormals();
  var dm = mesh(dg, M({ c: C.derm, op: .55, r: .7, cc: 0, sh: .5, cut: true, p: 'dermis' }), g); dm.position.y = top - 1.43 - .6;
  var colM = M({ c: C.coll, r: .5, cc: .3, sh: .6, cut: true, p: 'collagen' });
  for (i = 0; i < 16; i++) {
    var yy = top - 1.62 - R() * .95, zz = -Dp / 2 + .1 + R() * (Dp - .2), ph = R() * 6;
    (function (yy, zz, ph) { mesh(sweep(function (t, o) { var xx = -W / 2 + t * W; o.set(xx, yy + Math.sin(xx * 3 + ph) * .06, zz + Math.sin(xx * 2.2 + ph) * .1); }, function () { return .035 + R() * .01; }, 90, 10), colM, g); })(yy, zz, ph);
  }
  var capM = M({ c: C.cap, r: .3, cc: .9, sh: .5, cut: true, p: 'capillary' });
  for (i = 0; i < 5; i++) {
    var cx = -W / 2 + .4 + i * (W - .8) / 4, cz = (R() - .5) * 1.2, ty = top - 1.47 + wave(cx, cz) - .02;
    mesh(sweep(curvePath([new THREE.Vector3(cx - .12, top - 2.4, cz), new THREE.Vector3(cx - .1, ty - .2, cz), new THREE.Vector3(cx, ty, cz), new THREE.Vector3(cx + .1, ty - .2, cz), new THREE.Vector3(cx + .12, top - 2.4, cz)]), function () { return .035; }, 50, 10), capM, g);
  }
  g.position.y = .55;
};

/* ----- DNA: two turns of B-DNA with real spacing ----- */
BUILD.dna = function (g, variant) {
  var mut = variant === 'mutation', S = .1, rise = 3.38 * S, twist = 34.3 * Math.PI / 180, rP = 8.9 * S, rC = 5.9 * S, off = 2.3, n = 22;
  var seq = 'GATTACAGCCTGAATCGCATGC', pair = { A: 'T', T: 'A', G: 'C', C: 'G' }, colr = { A: C.at, T: C.ta, G: C.gc, C: C.cg };
  var y0 = -(n - 1) * rise / 2, bbM = M({ c: C.bb, r: .3, cc: 1, sh: .4, p: 'backbone' }), pM = M({ c: 0xFFB74D, r: .3, cc: 1, sh: .3, p: 'backbone' });
  [0, off].forEach(function (o) {
    mesh(sweep(function (t, out) { var i = t * (n - 1), a = i * twist + o; out.set(Math.cos(a) * rP, y0 + i * rise, Math.sin(a) * rP); }, function () { return .13; }, n * 16, 14), bbM, g);
    var ph = inst(new THREE.IcosahedronGeometry(.17, 3), pM, n, g);
    for (var i = 0; i < n; i++) { var a = i * twist + o; put(ph, i, Math.cos(a) * rP, y0 + i * rise, Math.sin(a) * rP, 0, 0, 0, 1); }
  });
  var mats = {}; function bm(b, part, glow) { var k = b + part + (glow ? 'g' : ''); if (!mats[k]) mats[k] = M({ c: colr[b], r: .35, cc: .8, sh: .5, p: part }); return mats[k]; }
  var mutAt = 11, slab = new THREE.CapsuleGeometry(.09, 1, 6, 16); slab.rotateZ(Math.PI / 2);
  for (var i = 0; i < n; i++) {
    var a1 = i * twist + .25, a2 = i * twist + off - .25, y = y0 + i * rise;
    var p1 = new THREE.Vector3(Math.cos(a1) * rC, y, Math.sin(a1) * rC), p2 = new THREE.Vector3(Math.cos(a2) * rC, y, Math.sin(a2) * rC), mid = p1.clone().lerp(p2, .5);
    var b1 = seq[i], b2 = pair[b1], isMut = mut && i === mutAt, part = isMut ? 'mutation' : (b1 === 'A' || b1 === 'T' ? 'at' : 'gc');
    if (isMut) { b1 = 'G'; b2 = 'T'; }
    [[p1, b1], [p2, b2]].forEach(function (q) {
      var len = q[0].distanceTo(mid) - .05, m = mesh(slab, isMut ? M({ c: C.mut, r: .3, cc: 1, sh: .5, p: 'mutation' }) : bm(q[1], part), g);
      m.scale.set(len, 1.25, 1.9); m.position.copy(q[0]).lerp(mid, .5).add(new THREE.Vector3(0, 0, 0));
      m.lookAt(mid); m.rotateY(Math.PI / 2);
      var st = mesh(new THREE.CylinderGeometry(.05, .05, 1, 8), bbM, g), from = q[0], to = new THREE.Vector3(Math.cos(Math.atan2(q[0].z, q[0].x)) * rP, y, Math.sin(Math.atan2(q[0].z, q[0].x)) * rP);
      st.scale.y = from.distanceTo(to); st.position.copy(from).lerp(to, .5); st.lookAt(to); st.rotateX(Math.PI / 2);
    });
  }
  g.rotation.z = .35;
};

/* ----- Infections: an influenza-like virus, and two kinds of bacteria for the Gram stain ----- */
BUILD.infect = function (g, variant) {
  var R = rngF(variant === 'virus' ? 53 : variant === 'gramneg' ? 61 : 67), v = new THREE.Vector3(), i;
  if (variant === 'virus') {
    mesh(blob(1.35, .03, 2, 3, 24), M({ c: C.env, op: .55, r: .45, cc: .6, sh: 1, shc: 0xffe0d0, ds: true, cut: true, p: 'envelope' }), g);
    mesh(blob(1.24, .03, 2, 4, 20), M({ c: C.m1, op: .35, r: .5, cc: 0, sh: .6, ds: true, cut: true, p: 'matrix' }), g);
    /* spikes: HA as tall trimers, NA as mushrooms, spread evenly with a golden spiral */
    var N = 190, haM = M({ c: C.ha, r: .35, cc: .6, sh: .6, p: 'ha' }), naM = M({ c: C.na, r: .35, cc: .6, sh: .6, p: 'na' });
    var stalk = new THREE.CylinderGeometry(.03, .04, .26, 8), head = blob(1, .15, 2.4, 9, 6, 1, 1.4, 1), naHead = new THREE.SphereGeometry(.07, 14, 10);
    var nHA = 0, nNA = 0, kinds = []; for (i = 0; i < N; i++) { var isNA = R() < .18; kinds.push(isNA); if (isNA) nNA++; else nHA++; }
    var haS = inst(stalk, haM, nHA * 3, g), haH = inst(head, haM, nHA, g), naS = inst(stalk, naM, nNA, g), naH = inst(naHead, naM, nNA, g), a = 0, b = 0;
    var q = new THREE.Quaternion(), upv = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    for (i = 0; i < N; i++) {
      var yy = 1 - (i + .5) / N * 2, rr = Math.sqrt(1 - yy * yy), th = i * 2.39996; v.set(Math.cos(th) * rr, yy, Math.sin(th) * rr);
      q.setFromUnitVectors(upv, v);
      if (!kinds[i]) {
        for (var k = 0; k < 3; k++) { var t2 = new THREE.Vector3(Math.cos(k * 2.1) * .03, 0, Math.sin(k * 2.1) * .03).applyQuaternion(q); pos.copy(v).multiplyScalar(1.47).add(t2); m4.compose(pos, q, sc.set(1, 1, 1)); haS.setMatrixAt(a * 3 + k, m4); }
        pos.copy(v).multiplyScalar(1.63); m4.compose(pos, q, sc.set(.075, .075, .075)); haH.setMatrixAt(a, m4); a++;
      } else {
        pos.copy(v).multiplyScalar(1.47); m4.compose(pos, q, sc.set(.7, 1, .7)); naS.setMatrixAt(b, m4);
        pos.copy(v).multiplyScalar(1.61); m4.compose(pos, q, sc.set(1, .7, 1)); naH.setMatrixAt(b, m4); b++;
      }
    }
    /* eight RNA segments, the flu genome, as coiled rods */
    var rM = M({ c: C.rnp, r: .4, cc: .5, sh: .6, p: 'rna' });
    for (i = 0; i < 8; i++) {
      var ang = i / 8 * Math.PI * 2, cx = Math.cos(ang) * .45, cz = Math.sin(ang) * .45, len = .9 + R() * .5;
      (function (cx, cz, len, ph) { mesh(sweep(function (t, o) { var yy2 = (t - .5) * len; o.set(cx + Math.cos(t * 28 + ph) * .06, yy2, cz + Math.sin(t * 28 + ph) * .06); }, function () { return .035; }, 220, 8), rM, g); })(cx, cz, len, R() * 6);
    }
    return;
  }
  /* Bacterium: a rod, cut open to show its wall */
  var neg = variant === 'gramneg', L = 2.2, r0 = .62;
  function rod(r, l) { return new THREE.CapsuleGeometry(r, l, 16, 48); }
  var body = new THREE.Group(); g.add(body); body.rotation.z = Math.PI / 2;
  if (neg) mesh(rod(r0 + .06, L), M({ c: C.omem, op: .45, r: .35, cc: 1, sh: 1, ds: true, cut: true, p: 'outer' }), body);
  mesh(rod(neg ? r0 + .015 : r0 + .07, L), M({ c: C.pg, op: neg ? .9 : 1, r: .55, cc: .2, sh: .7, ds: true, cut: true, p: 'wall' }), body).scale.set(1, 1, 1);
  if (!neg) mesh(rod(r0 - .05, L), M({ c: C.pg, r: .6, cc: .1, sh: .6, ds: true, cut: true, p: 'wall' }), body);
  mesh(rod(neg ? r0 - .02 : r0 - .08, L), M({ c: C.imem, op: .6, r: .35, cc: .8, sh: .8, ds: true, cut: true, p: 'inner' }), body);
  var rb = inst(new THREE.IcosahedronGeometry(.028, 2), M({ c: C.ribo, r: .4, cc: .4, sh: .4, p: 'ribo' }), 260, body);
  for (i = 0; i < 260; i++) { inBall(R, 1, v); put(rb, i, v.x * (r0 - .15), v.y * (L / 2 + .3), v.z * (r0 - .15), 0, 0, 0, 1); }
  var pts = []; for (i = 0; i < 26; i++) pts.push(new THREE.Vector3((R() - .5) * .5, (R() - .5) * (L * .8), (R() - .5) * .5));
  mesh(sweep(curvePath(pts), function () { return .022; }, 600, 6), M({ c: C.nucleoid, r: .4, cc: .4, sh: .5, p: 'nucleoid' }), body);
  if (neg) { /* flagella: long helical whips from one end */
    var fM = M({ c: C.flag, r: .35, cc: .6, sh: .3, p: 'flagella' });
    for (i = 0; i < 3; i++) { (function (ph, tilt) { mesh(sweep(function (t, o) { o.set(Math.cos(t * 18 + ph) * .1 * t + tilt * t, L / 2 + r0 + t * 1.3, Math.sin(t * 14 + ph) * .08 * t); }, function () { return .016; }, 200, 6), fM, body); })(i * 2, (i - 1) * .35); }
  } else { /* pili: short hairs all over */
    var pM = M({ c: C.flag, r: .4, cc: .4, sh: .3, p: 'flagella' }), pg = new THREE.CylinderGeometry(.008, .008, .22, 5), pi = inst(pg, pM, 80, body), qq = new THREE.Quaternion(), up2 = new THREE.Vector3(0, 1, 0), mm = new THREE.Matrix4(), dir = new THREE.Vector3(), at = new THREE.Vector3();
    for (i = 0; i < 80; i++) { var yy3 = (R() - .5) * L, an = R() * 6.28; dir.set(Math.cos(an), 0, Math.sin(an)); at.set(dir.x * (r0 + .17), yy3, dir.z * (r0 + .17)); qq.setFromUnitVectors(up2, dir); mm.compose(at, qq, new THREE.Vector3(1, 1, 1)); pi.setMatrixAt(i, mm); }
  }
};

/* ----- Forensic: compact bone, the part that survives longest and tells age and injury ----- */
BUILD.forensic = function (g) {
  var R = rngF(71), H = 2.4, v = new THREE.Vector3();
  var centers = [[0, 0, .78], [1.25, 0, .3], [-1.2, 0, .35], [.62, 0, -.85], [-.7, 0, -.8]];
  var lamA = M({ c: C.lam, r: .6, cc: .3, sh: .7, ds: true, cut: true, p: 'lamellae' }), lamB = M({ c: C.lam2, r: .6, cc: .3, sh: .7, ds: true, cut: true, p: 'lamellae' });
  var ocM = M({ c: C.ocyte, r: .5, cc: .3, sh: .4, cut: true, p: 'osteocyte' }), caM = M({ c: C.cana, r: .5, cc: 0, sh: .3, cut: true, p: 'osteocyte' });
  centers.forEach(function (c, ci) {
    var o = new THREE.Group(); g.add(o); o.position.set(c[0], c[1], c[2]);
    var rings = ci === 0 ? 7 : 5, rr = ci === 0 ? .62 : .5;
    for (var k = 0; k < rings; k++) {
      var r1 = .11 + (k + 1) * (rr - .11) / rings;
      var cyl = new THREE.CylinderGeometry(r1, r1, H, 72, 1, true); mesh(cyl, k % 2 ? lamA : lamB, o);
    }
    /* top face: concentric rings like a cross-section under the microscope */
    var face = new THREE.RingGeometry(.11, rr, 72, rings); face.rotateX(-Math.PI / 2);
    var cols = [], fp = face.attributes.position, ca = new THREE.Color(C.lam), cb = new THREE.Color(C.lam2);
    for (var i = 0; i < fp.count; i++) { var d = Math.hypot(fp.getX(i), fp.getZ(i)), band = Math.floor((d - .11) / ((rr - .11) / rings) + .001) % 2, cc = band ? ca : cb; cols.push(cc.r, cc.g, cc.b); }
    face.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    var fm = M({ c: 0xffffff, r: .6, cc: .3, sh: .6, ds: true, cut: true, p: 'lamellae' }); fm.vertexColors = true;
    [H / 2, -H / 2].forEach(function (y) { mesh(face, fm, o).position.y = y; });
    /* cement line around each osteon */
    mesh(new THREE.CylinderGeometry(rr + .015, rr + .015, H, 72, 1, true), M({ c: C.cement, r: .6, cc: .2, sh: .4, ds: true, cut: true, p: 'cement' }), o);
    /* Haversian canal with an artery, a vein and a nerve */
    mesh(new THREE.CylinderGeometry(.06, .06, H + .02, 20), M({ c: C.hav, r: .35, cc: .8, sh: .5, cut: true, p: 'canal' }), o).position.set(-.03, 0, .01);
    mesh(new THREE.CylinderGeometry(.045, .045, H + .02, 20), M({ c: 0x5C6BC0, r: .35, cc: .8, sh: .5, cut: true, p: 'canal' }), o).position.set(.05, 0, -.02);
    mesh(new THREE.CylinderGeometry(.025, .025, H + .02, 12), M({ c: C.nerve, r: .35, cc: .8, sh: .5, cut: true, p: 'canal' }), o).position.set(.01, 0, .06);
    /* osteocytes sit between rings, with tiny canals reaching toward the center */
    var n = ci === 0 ? 46 : 30, oc = inst(blob(1, .15, 2, 31, 6), ocM, n, o), cn = inst(new THREE.CylinderGeometry(.006, .006, 1, 4), caM, n * 2, o), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (i = 0; i < n; i++) {
      var ring = 1 + Math.floor(R() * (rings - 1)), r2 = .11 + ring * (rr - .11) / rings, an = R() * Math.PI * 2, y = (R() - .5) * (H - .1);
      put(oc, i, Math.cos(an) * r2, y, Math.sin(an) * r2, 0, -an, 0, .045, .11, .025);
      for (var j = 0; j < 2; j++) {
        var dir = new THREE.Vector3(-Math.cos(an + (j - .5) * .3), (R() - .5) * .2, -Math.sin(an + (j - .5) * .3)).normalize(), len = .06 + R() * .05;
        q.setFromUnitVectors(up, dir); v.set(Math.cos(an) * r2, y, Math.sin(an) * r2).addScaledVector(dir, len / 2);
        m4.compose(v, q, new THREE.Vector3(1, len, 1)); cn.setMatrixAt(i * 2 + j, m4);
      }
    }
  });
  /* a Volkmann canal crossing sideways between osteons */
  mesh(sweep(function (t, o) { o.set(-1.8 + t * 3.6, -.3 + Math.sin(t * 3) * .05, .2 - t * .3); }, function () { return .05; }, 60, 14), M({ c: C.hav, r: .35, cc: .8, sh: .5, cut: true, p: 'volkmann' }), g);
  g.rotation.x = .35;
};

/* ================= Stage ================= */
function roomEnv(renderer) {
  var scene = new THREE.Scene(), geo = new THREE.BoxGeometry(); geo.deleteAttribute('uv');
  var roomM = new THREE.MeshStandardMaterial({ side: THREE.BackSide, color: 0x9a9aa4 }), boxM = new THREE.MeshStandardMaterial();
  var main = new THREE.PointLight(0xffffff, 900, 28, 2); main.position.set(.418, 16.199, .3); scene.add(main);
  var room = new THREE.Mesh(geo, roomM); room.position.set(-.757, 13.219, .717); room.scale.set(31.713, 28.305, 28.591); scene.add(room);
  [[-10.906, 2.009, 1.846, -.195, 2.328, 7.905, 4.651], [-5.607, -.754, -.758, .994, 1.97, 1.534, 3.955], [6.167, .857, 7.803, .561, 3.927, 6.285, 3.687], [-2.017, .018, 6.124, .333, 2.002, 4.566, 2.064], [2.291, -.756, -2.621, -.286, 1.546, 1.552, 1.496], [-2.193, -.369, -5.547, .516, 3.875, 3.487, 2.986]].forEach(function (b) {
    var m = new THREE.Mesh(geo, boxM); m.position.set(b[0], b[1], b[2]); m.rotation.set(0, b[3], 0); m.scale.set(b[4], b[5], b[6]); scene.add(m);
  });
  function light(i, p, s) { var m = new THREE.MeshBasicMaterial(); m.color.setScalar(i); var x = new THREE.Mesh(geo, m); x.position.set(p[0], p[1], p[2]); x.scale.set(s[0], s[1], s[2]); scene.add(x); }
  light(50, [-16.116, 14.37, 8.208], [.1, 2.428, 2.739]); light(50, [-16.109, 18.021, -8.207], [.1, 2.425, 2.751]); light(17, [14.904, 12.198, -1.832], [.15, 4.265, 6.331]);
  light(43, [-.462, 8.89, 14.52], [4.38, 5.441, .088]); light(20, [3.235, 11.486, -12.541], [2.5, 2, .1]); light(100, [0, 20, 0], [1, .1, 1]);
  var pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(scene, .04); pm.dispose();
  return rt.texture;
}

export function mount(stage, opts) {
  opts = opts || {};
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ren = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  ren.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); ren.outputColorSpace = THREE.SRGBColorSpace;
  ren.toneMapping = THREE.ACESFilmicToneMapping; ren.toneMappingExposure = 1.05; ren.localClippingEnabled = true; ren.setClearColor(0x000000, 0);
  ren.domElement.className = 'lab3d-canvas'; stage.appendChild(ren.domElement);
  var scene = new THREE.Scene(); scene.environment = roomEnv(ren);
  var cam = new THREE.PerspectiveCamera(32, 1, .1, 100), dist = 8.2, minD = 3.2, maxD = 14;
  var key = new THREE.DirectionalLight(0xfff1e6, 1.6); key.position.set(3, 5, 4); scene.add(key);
  var rim = new THREE.DirectionalLight(0x9ec5ff, 1.4); rim.position.set(-4, 2, -5); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffe4ef, 0x1a1020, .35));
  var pivot = new THREE.Group(); scene.add(pivot);
  var model = null, topic = null, variant = null, focus = null, spin = !RM, cutV = 1;
  var rotX = .25, rotY = -.5, vX = 0, vY = 0, raf = 0, alive = true, dirty = true, t0 = performance.now();

  function clear() {
    if (!model) return;
    pivot.remove(model);
    model.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(function (m) { m.dispose(); }); });
    model = null;
  }
  function size(obj) { var b = new THREE.Box3().setFromObject(obj), s = new THREE.Vector3(), c = new THREE.Vector3(); b.getSize(s); b.getCenter(c); return { s: s, c: c, b: b }; }
  function build(t, vnt) {
    clear(); topic = t; variant = vnt;
    var g = new THREE.Group(); BUILD[t](g, vnt);
    var wrap = new THREE.Group(); wrap.add(g); var z = size(wrap); g.position.sub(z.c);
    var k = 2.4 / Math.max(z.s.x, z.s.y, z.s.z * .9); wrap.scale.setScalar(k * 1.5);
    model = wrap; pivot.add(model); box = z.b.clone().translate(z.c.clone().negate()); setCut(cutV); highlight(focus); dirty = true;
  }
  var box = null;
  function setCut(v) {
    cutV = v; if (!model) return;
    /* The cut lives in the model's own space, so it turns with the model. 1 keeps everything, 0 removes the front half. */
    LCLIP.normal.set(-1, 0, 0); LCLIP.constant = box.max.x + .01 - (1 - v) * (box.max.x - box.min.x) * .5;
    dirty = true;
  }
  function highlight(p) {
    focus = p; if (!model) return;
    model.traverse(function (o) {
      if (!o.material) return;
      [].concat(o.material).forEach(function (m) {
        var on = p && m.userData.part === p;
        m.emissive.copy(on ? m.userData.base : new THREE.Color(0)).multiplyScalar(on ? .45 : 0);
        m.emissiveIntensity = 1;
      });
    });
    dirty = true;
  }
  function resize() { var w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; ren.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); dirty = true; }
  var ro = window.ResizeObserver ? new ResizeObserver(resize) : null; if (ro) ro.observe(stage); else window.addEventListener('resize', resize);

  /* Turn with a finger or the mouse, pinch or scroll to zoom, a flick keeps it turning */
  var ptrs = {}, last = null, pinch0 = 0, dist0 = dist, el = ren.domElement;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', function (e) { ptrs[e.pointerId] = [e.clientX, e.clientY]; try { el.setPointerCapture(e.pointerId); } catch (x) {} var k = Object.keys(ptrs); if (k.length === 2) { var a = ptrs[k[0]], b = ptrs[k[1]]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); dist0 = dist; } last = [e.clientX, e.clientY, performance.now()]; vX = vY = 0; });
  el.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId]) return; ptrs[e.pointerId] = [e.clientX, e.clientY]; var k = Object.keys(ptrs);
    if (k.length === 2) { var a = ptrs[k[0]], b = ptrs[k[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) dist = Math.min(maxD, Math.max(minD, dist0 * pinch0 / d)); dirty = true; return; }
    var now = performance.now(), dx = e.clientX - last[0], dy = e.clientY - last[1], dt = Math.max(8, now - last[2]);
    rotY += dx * .008; rotX = Math.max(-1.3, Math.min(1.3, rotX + dy * .006)); vY = dx * .008 / dt * 16; vX = dy * .006 / dt * 16; last = [e.clientX, e.clientY, now]; dirty = true;
  });
  function up(e) { delete ptrs[e.pointerId]; if (Object.keys(ptrs).length < 2) pinch0 = 0; }
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', function (e) { e.preventDefault(); dist = Math.min(maxD, Math.max(minD, dist * (1 + e.deltaY * .0012))); dirty = true; }, { passive: false });

  function frame(now) {
    if (!alive) return; raf = requestAnimationFrame(frame);
    var moving = Object.keys(ptrs).length > 0;
    if (!moving) { if (Math.abs(vY) > 1e-4 || Math.abs(vX) > 1e-4) { rotY += vY; rotX = Math.max(-1.3, Math.min(1.3, rotX + vX)); vY *= .93; vX *= .93; dirty = true; } else if (spin) { rotY += .0035; dirty = true; } }
    var pulse = focus ? .35 + .15 * Math.sin((now - t0) / 380) : 0;
    if (focus && model) { model.traverse(function (o) { if (o.material) [].concat(o.material).forEach(function (m) { if (m.userData.part === focus) m.emissive.copy(m.userData.base).multiplyScalar(pulse); }); }); dirty = true; }
    if (!dirty || document.hidden || !stage.offsetParent) return;
    pivot.rotation.set(rotX, rotY, 0);
    cam.position.set(0, 0, dist); cam.lookAt(0, 0, 0);
    if (model) { pivot.updateMatrixWorld(true); CLIP.copy(LCLIP).applyMatrix4(model.matrixWorld); }
    ren.render(scene, cam); dirty = false;
  }
  resize(); raf = requestAnimationFrame(frame);
  return {
    show: function (t, v) { build(t, v); },
    cut: setCut,
    focus: highlight,
    spin: function (b) { spin = !!b; dirty = true; },
    reset: function () { rotX = .25; rotY = -.5; vX = vY = 0; dist = 8.2; dirty = true; },
    resize: resize,
    dispose: function () { alive = false; cancelAnimationFrame(raf); clear(); if (ro) ro.disconnect(); ren.dispose(); el.remove(); }
  };
}
export var built = BUILD;
export { THREE };
