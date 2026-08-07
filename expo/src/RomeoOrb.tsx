import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

/// Romeo's "listening" presence — a living neural-net orb. This is a faithful
/// port of the design handoff (Romeo Orb.dc.html): the exact canvas algorithm
/// runs inside a WebView (works in Expo Go), with the DesignComponent wrapper
/// dropped as the handoff instructs. Tunables map 1:1 to the design tokens.
export type OrbPalette = "Amber & coral" | "Cyan glow" | "Iridescent";

type Props = {
  palette?: OrbPalette;
  density?: number; // node count, 40–360 (default 160)
  asymmetry?: number; // 0–100 (default 25)
  breath?: number; // speed 0.4–2 (default 0.9)
};

export function RomeoOrb({
  palette = "Amber & coral",
  density = 160,
  asymmetry = 25,
  breath = 0.9,
}: Props) {
  const html = useMemo(
    () => buildHtml({ palette, density, asymmetry, breath }),
    [palette, density, asymmetry, breath]
  );

  return (
    <View style={styles.container} pointerEvents="none">
      <WebView
        style={styles.web}
        originWhitelist={["*"]}
        source={{ html }}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        automaticallyAdjustContentInsets={false}
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#050402",
  },
  web: { flex: 1, backgroundColor: "#050402" },
});

function buildHtml(props: Props): string {
  // The ONLY interpolation into the canvas code is the config object. The canvas
  // code below uses string concatenation (no backticks / ${}) so it lives safely
  // inside this template literal.
  return `<!doctype html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>html,body{margin:0;height:100%;background:#050402;overflow:hidden;}
canvas{position:absolute;inset:0;width:100%;height:100%;display:block;}</style>
</head><body><canvas id="c"></canvas>
<script>window.__ORB__=${JSON.stringify(props)};
(function(){
  var P = window.__ORB__ || {};
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var W,H,cx,cy,R, nodes, edges, dust, sparkSprite, dustColor, swirlSeed, t0;
  var cfg = {
    palette: P.palette || 'Amber & coral',
    density: Math.max(30, Math.round(P.density != null ? P.density : 160)),
    breath: (P.breath != null ? P.breath : 0.9),
    asym: ((P.asymmetry != null ? P.asymmetry : 25) / 100) * 0.55
  };

  function lerp(a,b,t){ return a + (b-a)*t; }

  function hsl2rgb(h,s,l){
    h = ((h % 360) + 360) % 360 / 360;
    var q = l < 0.5 ? l*(1+s) : l + s - l*s, p = 2*l - q;
    var f = function(t){
      t = (t+1) % 1;
      if (t < 1/6) return p + (q-p)*6*t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q-p)*(2/3 - t)*6;
      return p;
    };
    return [Math.round(f(h+1/3)*255), Math.round(f(h)*255), Math.round(f(h-1/3)*255)];
  }

  function colorFor(rr, a, name){
    if (name === 'Iridescent'){
      var hue = (a/(Math.PI*2))*320 + rr*70 + 10;
      return hsl2rgb(hue, 0.82, 0.62);
    }
    var stops;
    if (name === 'Cyan glow') stops = [[120,235,255],[70,150,255],[150,205,255]];
    else stops = [[255,108,72],[255,164,80],[255,214,142]];
    var seg = rr < 0.5 ? [stops[0], stops[1], rr/0.5] : [stops[1], stops[2], (rr-0.5)/0.5];
    var A = seg[0], B = seg[1], t = seg[2];
    return [Math.round(lerp(A[0],B[0],t)), Math.round(lerp(A[1],B[1],t)), Math.round(lerp(A[2],B[2],t))];
  }

  function glowSprite(c){
    var S = 96, cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    var g = cv.getContext('2d');
    var grd = g.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
    grd.addColorStop(0, 'rgba('+c[0]+','+c[1]+','+c[2]+',1)');
    grd.addColorStop(0.4, 'rgba('+c[0]+','+c[1]+','+c[2]+',0.28)');
    grd.addColorStop(1, 'rgba('+c[0]+','+c[1]+','+c[2]+',0)');
    g.fillStyle = grd; g.fillRect(0,0,S,S);
    return cv;
  }

  function makeSparkSprite(){
    var S = 48, cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    var g = cv.getContext('2d');
    var grd = g.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
    grd.addColorStop(0, 'rgba(255,236,208,1)');
    grd.addColorStop(0.5, 'rgba(255,210,160,0.5)');
    grd.addColorStop(1, 'rgba(255,200,150,0)');
    g.fillStyle = grd; g.fillRect(0,0,S,S);
    return cv;
  }

  function makeNode(nx, ny, rr){
    var c = colorFor(rr, Math.atan2(ny,nx), cfg.palette);
    var base = 2.6*(1 - rr*0.55) + Math.random()*1.4 + (rr < 0.001 ? 2.4 : 0);
    var r0 = Math.hypot(nx,ny), a0 = Math.atan2(ny,nx);
    var swirl = 0.055*Math.sin(a0*2 + r0*3.2 + (swirlSeed||0))
              + 0.022*Math.sin(a0*3 - r0*2 + (swirlSeed||0)*1.7);
    return { nx:nx, ny:ny, r0:r0, a0:a0, swirl:swirl, c:c, base:base,
      sprite: glowSprite(c), phase: Math.random()*6.283, spd: 0.4 + Math.random()*0.8 };
  }

  function buildGraph(){
    var N = cfg.density, asym = cfg.asym;
    swirlSeed = Math.random()*6.283;
    var p1 = Math.random()*6.283, p2 = Math.random()*6.283, p3 = Math.random()*6.283;
    var shape = function(a){ return 1 + asym*(0.5*Math.sin(a+p1) + 0.32*Math.sin(2*a+p2) + 0.22*Math.sin(3*a+p3)); };
    nodes = [makeNode(0,0,0)];
    for (var i=1; i<N; i++){
      var a = Math.random()*6.283;
      var rr = Math.pow(Math.random(), 1.15);
      var r = rr*0.96*shape(a);
      nodes.push(makeNode(r*Math.cos(a), r*Math.sin(a), Math.min(1, Math.abs(rr))));
    }
    edges = []; var seen = {}, k = 3;
    for (var ii=0; ii<nodes.length; ii++){
      var d = [];
      for (var j=0; j<nodes.length; j++){
        if (ii===j) continue;
        var dx = nodes[ii].nx - nodes[j].nx, dy = nodes[ii].ny - nodes[j].ny;
        d.push([dx*dx + dy*dy, j]);
      }
      d.sort(function(u,v){ return u[0]-v[0]; });
      for (var m=0; m<k && m<d.length; m++){
        var jj = d[m][1], key = ii < jj ? ii+'-'+jj : jj+'-'+ii;
        if (seen[key]) continue;
        seen[key] = 1;
        var dist = Math.sqrt(d[m][0]);
        edges.push({ a:ii, b:jj, base: 0.09 + 0.11*(1 - Math.min(1, dist*1.4)),
          spark: Math.random() < 0.4, spd: 0.07 + Math.random()*0.13, off: Math.random() });
      }
    }
    sparkSprite = makeSparkSprite();
    var pal = cfg.palette;
    dustColor = pal === 'Cyan glow' ? [150,210,255] : pal === 'Iridescent' ? [255,190,150] : [255,182,128];
    buildDust();
  }

  function buildDust(){
    var M = 1600; dust = [];
    var seed = swirlSeed || 0;
    for (var i=0; i<M; i++){
      var a = Math.random()*6.283;
      var r0 = Math.pow(Math.random(), 0.8)*1.18;
      var swirl = 0.05*Math.sin(a*2 + r0*3.2 + seed) + 0.02*Math.sin(a*3 - r0*2 + seed*1.7);
      dust.push({ r0:r0, a0:a, swirl:swirl, size: 0.6 + Math.random()*1.1,
        phase: Math.random()*6.283, spd: 0.35 + Math.random()*1.0 });
    }
  }

  function resize(){
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = canvas.clientWidth || window.innerWidth;
    var h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(w*dpr);
    canvas.height = Math.round(h*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    W = w; H = h; cx = w/2; cy = h/2; R = Math.min(w,h)*0.42;
  }

  function frame(){
    var t = (performance.now()/1000) - t0;
    ctx.clearRect(0,0,W,H);

    ctx.globalCompositeOperation = 'source-over';
    var bg = ctx.createRadialGradient(cx,cy,0,cx,cy,R*1.5);
    bg.addColorStop(0, 'rgba(48,24,12,0.5)');
    bg.addColorStop(0.5, 'rgba(20,9,5,0.24)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);

    var bsp = cfg.breath;
    var breath = Math.sin(t*2*Math.PI/(8.5/bsp));
    var scale = 1 + 0.085*breath;
    var breathGlow = 0.78 + 0.22*(0.5 + 0.5*breath);
    var env = (0.66 + 0.34*(0.5 + 0.5*Math.sin(t*0.5))) * (0.78 + 0.22*(0.5 + 0.5*Math.sin(t*0.37 + 1.4))) * breathGlow;
    var ds = R/300;

    var baseRot = t*0.012;
    var pts = nodes.map(function(n){
      var rr = n.r0 + 0.012*Math.sin(t*0.6*bsp + n.phase);
      var ang = n.a0 + baseRot + t*n.swirl;
      var rad = rr*R*scale;
      return [cx + Math.cos(ang)*rad, cy + Math.sin(ang)*rad];
    });

    ctx.globalCompositeOperation = 'lighter';

    if (dust){
      var drot = baseRot*0.6, dc = dustColor;
      ctx.fillStyle = 'rgb('+dc[0]+','+dc[1]+','+dc[2]+')';
      for (var i=0; i<dust.length; i++){
        var dd = dust[i];
        var ang2 = dd.a0 + drot + t*dd.swirl*0.7;
        var rad2 = (dd.r0 + 0.01*Math.sin(t*0.5 + dd.phase))*R*scale;
        var x = cx + Math.cos(ang2)*rad2, y = cy + Math.sin(ang2)*rad2;
        var tw = 0.25 + 0.75*(0.5 + 0.5*Math.sin(t*dd.spd + dd.phase));
        var al = tw*env*(0.32 - 0.16*dd.r0);
        if (al <= 0.01) continue;
        var s = dd.size*ds;
        ctx.globalAlpha = al;
        ctx.fillRect(x - s, y - s, s*2, s*2);
      }
      ctx.globalAlpha = 1;
    }

    ctx.lineWidth = Math.max(0.6, 0.9*ds);
    ctx.strokeStyle = 'rgb(255,150,95)';
    var spr = sparkSprite;
    for (var e2=0; e2<edges.length; e2++){
      var e = edges[e2];
      var a = pts[e.a], b = pts[e.b], na = nodes[e.a];
      var pulseE = 0.5 + 0.5*Math.sin(t*na.spd + na.phase);
      ctx.globalAlpha = Math.min(1, e.base*(0.4 + 0.6*pulseE)*env);
      ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
      if (e.spark){
        var pr = (t*e.spd + e.off) % 1;
        var sx = a[0] + (b[0]-a[0])*pr, sy = a[1] + (b[1]-a[1])*pr;
        var sa = Math.sin(pr*Math.PI)*0.9*env, srr = 10*ds;
        ctx.globalAlpha = Math.min(1, sa);
        ctx.drawImage(spr, sx - srr, sy - srr, srr*2, srr*2);
      }
    }
    ctx.globalAlpha = 1;

    for (var n1=0; n1<nodes.length; n1++){
      var nn = nodes[n1], pp = pts[n1];
      var pulseN = 0.5 + 0.5*Math.sin(t*nn.spd + nn.phase);
      var radN = nn.base*ds*(0.8 + 0.5*pulseN);
      var glow = radN*5.5, aN = (0.5 + 0.5*pulseN)*env;
      ctx.globalAlpha = Math.min(1, aN);
      ctx.drawImage(nn.sprite, pp[0]-glow, pp[1]-glow, glow*2, glow*2);
    }
    ctx.fillStyle = 'rgb(255,246,232)';
    for (var n2=0; n2<nodes.length; n2++){
      var nc = nodes[n2], pc = pts[n2];
      var pulseC = 0.5 + 0.5*Math.sin(t*nc.spd + nc.phase);
      var radC = nc.base*ds*(0.8 + 0.5*pulseC);
      ctx.globalAlpha = Math.min(1, 0.85*(0.5 + 0.5*pulseC)*env);
      var cr = radC*0.6;
      ctx.fillRect(pc[0]-cr, pc[1]-cr, cr*2, cr*2);
    }
    ctx.globalAlpha = 1;

    var cb = 0.6 + 0.4*(0.5 + 0.5*breath);
    var cg = ctx.createRadialGradient(cx,cy,0,cx,cy,R*0.5*scale);
    cg.addColorStop(0, 'rgba(255,180,120,'+(0.5*cb*env)+')');
    cg.addColorStop(0.5, 'rgba(255,120,70,'+(0.16*cb*env)+')');
    cg.addColorStop(1, 'rgba(255,80,40,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx,cy,R*0.5*scale,0,7); ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(frame);
  }

  buildGraph();
  resize();
  window.addEventListener('resize', resize);
  t0 = performance.now()/1000;
  requestAnimationFrame(frame);
})();
</script></body></html>`;
}
