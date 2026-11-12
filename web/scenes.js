/* ============================================================================
   AURA · 桌面动态背景 —— 三个场景的片元着色器
   每个场景都是纯程序化生成（无贴图、无外部资源），由本机负载轻微调制。
   ============================================================================ */
(function () {
  'use strict';

  const HEAD = `#version 300 es
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform vec3  uAccent;
uniform float uLoad;       // 0..1 本机负载（CPU/内存/网络的平滑合成）
uniform float uIntensity;  // 0.4..1.6 动效强度
out vec4 fragColor;
`;

  const NOISE = `
float hash13(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 x){
  vec3 p = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(p);
  float n100 = hash13(p + vec3(1.0,0.0,0.0));
  float n010 = hash13(p + vec3(0.0,1.0,0.0));
  float n110 = hash13(p + vec3(1.0,1.0,0.0));
  float n001 = hash13(p + vec3(0.0,0.0,1.0));
  float n101 = hash13(p + vec3(1.0,0.0,1.0));
  float n011 = hash13(p + vec3(0.0,1.0,1.0));
  float n111 = hash13(p + vec3(1.0,1.0,1.0));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float fbm3(vec3 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(7.1); a *= 0.5; }
  return s;
}
float fbm5(vec3 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.02 + vec3(11.3); a *= 0.5; }
  return s;
}
float ridged(vec3 p){
  float n = vnoise(p);
  n = 1.0 - abs(2.0 * n - 1.0);
  return n * n;
}
float fbmR(vec3 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * ridged(p); p = p * 2.11 + vec3(5.2); a *= 0.55; }
  return s;
}
// fbm 的输出通常集中在 0.30~0.55，直接做 smoothstep 会几乎没有对比度
float norm(float n){ return clamp((n - 0.18) / 0.52, 0.0, 1.0); }
float grain(vec2 fc, float t){
  return hash13(vec3(fc, floor(t * 24.0))) - 0.5;
}
`;

  /* ---------------------------------------------------------------- 1. 深空星云 */
  const NEBULA = HEAD + NOISE + `
void main(){
  float t = uTime * (0.012 + 0.009 * uLoad * uIntensity);
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  // 把画面轻微旋转，让银河带斜穿桌面
  float ang = -0.36 + 0.012 * sin(uTime * 0.008);
  mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 q = R * uv;
  q += vec2(sin(uTime * 0.009) * 0.02, cos(uTime * 0.007) * 0.015);

  // 银河带：中心线轻微起伏
  float bend  = 0.10 * sin(q.x * 1.05 + t * 0.7) + 0.045 * sin(q.x * 2.35 - t * 0.5);
  float width = 0.30 + 0.045 * sin(q.x * 0.85 + t * 0.4);
  float band  = exp(-pow((q.y - bend) / width, 2.0) * 1.9);
  float bandW = exp(-pow((q.y - bend) / (width * 1.9), 2.0) * 1.4);   // 更宽的外晕

  // 云气：低频大团 + 高频细纹
  float n1 = norm(fbm3(vec3(q * 2.10, t * 0.55)));
  float n2 = norm(fbm3(vec3(q * 6.80, t * 0.95)));
  float n3 = norm(fbm3(vec3(q * 15.0, t * 1.30)));
  float n4 = norm(fbm3(vec3(q * 31.0, t * 1.8)));
  float gas = band * (0.38 + 0.95 * n1) * (0.70 + 0.55 * n2) * (0.85 + 0.30 * n3) * (0.90 + 0.18 * n4);

  // 银心：偏左的暖色亮核
  float corePos = exp(-pow((q.x + 0.52) / 0.62, 2.0));
  float coreAmp = exp(-pow((q.y - bend) / (width * 0.75), 2.0));

  vec3 col = vec3(0.0022, 0.0032, 0.0068);
  col += vec3(0.045, 0.095, 0.185) * gas * 0.85;                   // 冷蓝气体
  col += uAccent * pow(gas, 1.45) * 0.50;                          // 主题色
  col += vec3(0.46, 0.28, 0.16) * pow(gas * corePos, 1.9) * 0.70;  // 银心暖光
  col += vec3(0.30, 0.20, 0.13) * bandW * corePos * coreAmp * 0.35;
  col += uAccent * pow(bandW, 2.8) * 0.05;                         // 外晕

  // 尘埃带：压出暗纹，制造纵深
  float lane = smoothstep(0.30, 0.95, norm(fbm3(vec3(q * 3.60 + vec2(1.7), t * 0.65))));
  col *= 1.0 - 0.88 * lane * smoothstep(0.05, 0.90, band);

  // 星点：银河带内更密，带外稀疏
  vec3 stars = vec3(0.0);
  for (int i = 0; i < 3; i++){
    float sc = 210.0 + float(i) * 280.0;
    vec2 g = q * sc;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash13(vec3(id, float(i) + 3.0));
    float density = 0.976 - band * (0.050 + 0.014 * float(i));
    float present = step(density, h);
    float tw = 0.62 + 0.38 * sin(uTime * (0.5 + h * 1.6) + h * 41.0);
    float d = length(f);
    float sp = smoothstep(0.24, 0.0, d) * tw;
    vec3 tint = mix(vec3(0.78, 0.87, 1.0), vec3(1.0, 0.92, 0.82), fract(h * 7.0));
    stars += present * sp * (0.42 - 0.06 * float(i)) * tint;
  }
  // 少量亮星
  for (int i = 0; i < 2; i++){
    float sc = 24.0 + float(i) * 16.0;
    vec2 id = floor(q * sc);
    float h = hash13(vec3(id, 71.0 + float(i)));
    float present = step(0.94, h);
    vec2 c = (id + 0.5) / sc;
    vec2 dv = q - c;
    float d = length(dv);
    float halo = exp(-d * (560.0 - 160.0 * float(i)));
    stars += present * halo * (0.20 - 0.05 * float(i)) * vec3(0.90, 0.95, 1.0);
  }
  col += stars;

  // 暗角 + 抖动
  float vig = smoothstep(1.25, 0.18, length(uv * vec2(0.80, 1.0)));
  col *= mix(0.34, 1.0, vig);
  col += grain(gl_FragCoord.xy, uTime) * 0.009;

  fragColor = vec4(max(col, 0.0), 1.0);
}
`;

  /* ------------------------------------------------------------ 2. 抽象流体渐变 */
  const FLUID = HEAD + NOISE + `
// 流动光带：几条柔和的极光/丝绸带，被低频噪声缓慢牵引
void main(){
  float t = uTime * (0.035 + 0.022 * uLoad) * uIntensity;
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  uv *= 1.02;

  // 纵向的柔性位移，让光带像流体一样起伏
  float disp = (norm(fbm3(vec3(uv.x * 1.6, uv.y * 0.7, uTime * 0.018))) - 0.5) * 0.22
             + (norm(fbm3(vec3(uv.x * 3.4, uv.y * 1.4, uTime * 0.026 + 7.0))) - 0.5) * 0.09;
  vec2 p = vec2(uv.x, uv.y + disp);

  vec3 col = vec3(0.0035, 0.0060, 0.0125);

  // 主光带：深蓝 → 主题色 → 冷紫
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    float ph = fi * 2.15;
    float yc = 0.30 * sin(p.x * 0.72 + t * 1.05 + ph)
             + 0.11 * sin(p.x * 1.63 - t * 0.72 + ph * 1.7)
             + (fi - 1.0) * 0.30;
    float w  = 0.175 + 0.045 * sin(p.x * 1.15 + ph * 0.8);
    float d  = abs(p.y - yc) / w;
    float band = exp(-d * d * 1.55);

    vec3 tint;
    if (i == 0)      tint = vec3(0.045, 0.150, 0.330);            // 深蓝
    else if (i == 1) tint = uAccent * (0.95 + 0.12 * uLoad);      // 主题色
    else             tint = vec3(0.185, 0.090, 0.205);            // 冷紫

    // 细密纹理，避免像失焦的照片
    band *= 0.84 + 0.30 * norm(fbm3(vec3(p * 7.5, uTime * 0.05 + fi)));
    col += tint * band * 0.62;
    // 带心的高光与细亮边
    col += uAccent * pow(band, 3.2) * 0.09;
    col += uAccent * pow(band, 9.0) * 0.14;
  }

  // 带间弥散：整体一层极淡的主题色，让画面连成一片
  float haze = norm(fbm3(vec3(uv * 0.85, uTime * 0.012)));
  col += uAccent * haze * 0.035;

  // 轻微对比压缩，避免叠加过曝
  col = col / (1.0 + col * 0.55);
  col *= 1.15;

  // 暗角 + 颗粒
  float vig = smoothstep(1.35, 0.20, length(uv * vec2(0.78, 1.0)));
  col *= mix(0.55, 1.0, vig);
  col += grain(gl_FragCoord.xy, uTime) * 0.011;

  fragColor = vec4(max(col, 0.0), 1.0);
}
`;

  /* ------------------------------------------------------ 3. 极简几何 / 网格脉冲 */
  const GRID = HEAD + `
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime * uIntensity;

  float base = smoothstep(1.15, 0.0, length(uv * vec2(0.80, 1.0)));
  vec3 col = vec3(0.0070, 0.0090, 0.0135) + vec3(0.005, 0.009, 0.015) * base;

  // 细网格
  float cell = 0.040;
  vec2 gv = uv / cell;
  vec2 gw = max(fwidth(gv), vec2(1e-6));
  vec2 gl = abs(fract(gv - 0.5) - 0.5) / gw;
  float line = 1.0 - min(min(gl.x, gl.y), 1.0);
  col += uAccent * line * 0.062;

  // 主网格（每 5 格）
  vec2 gv2 = uv / (cell * 5.0);
  vec2 gw2 = max(fwidth(gv2), vec2(1e-6));
  vec2 gl2 = abs(fract(gv2 - 0.5) - 0.5) / gw2;
  float line2 = 1.0 - min(min(gl2.x, gl2.y), 1.0);
  col += uAccent * line2 * 0.125;

  // 八路细脉冲环：细、淡、错峰
  for (int i = 0; i < 8; i++){
    float fi = float(i);
    vec2 c = vec2(sin(fi * 2.31 + 0.4) * 1.15, cos(fi * 1.87 + 1.2) * 0.58);
    float d = length((uv - c) * vec2(1.0, 1.10));
    float ph = fract(t * (0.070 + 0.022 * fract(fi * 0.37)) + fi * 0.19);
    float r  = 0.04 + ph * 0.92;
    float wdt = 0.0022 + 0.0014 * (1.0 - ph);
    float ring = smoothstep(wdt, 0.0004, abs(d - r)) * (1.0 - ph) * (1.0 - ph);
    col += uAccent * ring * 0.40 * (0.7 + 0.5 * uLoad);
    col += uAccent * ring * line2 * 2.2;   // 与主网格交点处更亮，像真实脉冲
    // 环内余晖
    float trail = smoothstep(0.16, 0.0, abs(d - r) / (1.0 + 4.0 * ph)) * (1.0 - ph) * 0.05;
    col += uAccent * trail;
    col += uAccent * exp(-d * 30.0) * 0.055;
  }

  // 主网格交点十字
  vec2 iv = abs(fract(uv / (cell * 5.0) + 0.5) - 0.5) * (cell * 5.0);
  float cross = (smoothstep(0.007, 0.0, iv.x) * smoothstep(0.0011, 0.0, iv.y) +
                 smoothstep(0.007, 0.0, iv.y) * smoothstep(0.0011, 0.0, iv.x));
  col += uAccent * cross * 0.16;

  // 扫描线
  float sy = fract(t * 0.020) * 1.7 - 0.85;
  col += uAccent * smoothstep(0.085, 0.0, abs(uv.y - sy)) * 0.014;
  col += uAccent * smoothstep(0.0019, 0.0, abs(uv.y - sy)) * 0.075;

  float vig = smoothstep(1.20, 0.14, length(uv * vec2(0.84, 1.0)));
  col *= mix(0.50, 1.0, vig);
  col = pow(max(col, 0.0), vec3(0.88));

  fragColor = vec4(max(col, 0.0), 1.0);
}
`;

  window.AURA_SCENES = [
    { id: 'nebula', name: '深空星云', en: 'DEEP FIELD', frag: NEBULA },
    { id: 'fluid',  name: '抽象流体', en: 'FLUID HORIZON', frag: FLUID },
    { id: 'grid',   name: '极简网格', en: 'MINIMAL LATTICE', frag: GRID }
  ];
})();
