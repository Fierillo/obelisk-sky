// Post-processing and the quality ladder.
//
//   render → ambient occlusion (GTAO) → bloom → tilt-shift → grade → output
//
// Each level picks resolution, shadow-map size, AO and anti-aliasing (MSAA
// on the composer target; FXAA on the cheapest level). "auto" starts high and
// steps down while frames are slow; a fixed level stays put.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';

const TiltShift = (horizontal: boolean) => ({
  uniforms: {
    tDiffuse: { value: null },
    uAmount: { value: 1.0 },
    uFocus: { value: 0.5 },
    uBand: { value: 0.22 },
    uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uAmount, uFocus, uBand; uniform vec2 uTexel; varying vec2 vUv;
    void main(){
      float d = max(abs(vUv.y - uFocus) - uBand, 0.0);
      float r = clamp(d * 9.0, 0.0, 1.0) * 3.2 * uAmount;
      vec2 dir = ${horizontal ? 'vec2(uTexel.x, 0.0)' : 'vec2(0.0, uTexel.y)'} * r;
      vec4 s = texture2D(tDiffuse, vUv) * 0.227;
      s += (texture2D(tDiffuse, vUv + dir * 1.385) + texture2D(tDiffuse, vUv - dir * 1.385)) * 0.316;
      s += (texture2D(tDiffuse, vUv + dir * 3.231) + texture2D(tDiffuse, vUv - dir * 3.231)) * 0.0703;
      gl_FragColor = s;
    }`,
});

/** A light colour grade: a touch more saturation and contrast, soft vignette. */
const Grade = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.08 }, uContrast: { value: 1.04 }, uVignette: { value: 0.22 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uSat, uContrast, uVignette; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb = (c.rgb - 0.5) * uContrast + 0.5;
      float v = smoothstep(0.85, 0.25, distance(vUv, vec2(0.5)));
      c.rgb *= mix(1.0 - uVignette, 1.0, v);
      gl_FragColor = c;
    }`,
};

export type Level = 'low' | 'medium' | 'high' | 'ultra';

export interface PostSettings {
  quality: 'auto' | Level;
  resolution: number;
  shadows: boolean;
  ambientOcclusion: boolean;
  bloom: boolean;
  tiltShift: boolean;
}

const LEVELS: Record<Level, { pixelRatio: number; shadowMap: number; ao: 'off' | 'half' | 'full'; msaa: number }> = {
  low: { pixelRatio: 1, shadowMap: 1024, ao: 'off', msaa: 0 },
  medium: { pixelRatio: 1.25, shadowMap: 2048, ao: 'off', msaa: 4 },
  high: { pixelRatio: 1.75, shadowMap: 2048, ao: 'half', msaa: 4 },
  ultra: { pixelRatio: 2, shadowMap: 4096, ao: 'full', msaa: 4 },
};
const ORDER: Level[] = ['low', 'medium', 'high', 'ultra'];

export class Post {
  readonly composer: EffectComposer;
  private target: THREE.WebGLRenderTarget;
  private gtao: GTAOPass;
  private bloom: UnrealBloomPass;
  private tiltH: ShaderPass;
  private tiltV: ShaderPass;
  private grade: ShaderPass;
  private fxaa: FXAAPass;
  level: Level = 'high';
  settings: PostSettings = { quality: 'auto', resolution: 1, shadows: true, ambientOcclusion: true, bloom: true, tiltShift: true };
  private frameTimes: number[] = [];
  private cooldown = 5;
  private held = false;
  private size = new THREE.Vector2(1, 1);

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    private sun: THREE.DirectionalLight,
  ) {
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, this.target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.gtao = new GTAOPass(scene, camera, 1, 1);
    this.gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.3, thickness: 1.5, scale: 1.1, samples: 12 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    // Soft: strong AO turns pets' bellies and people's undersides black.
    this.gtao.blendIntensity = 0.6;
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.5, 0.88);
    this.composer.addPass(this.bloom);
    this.tiltH = new ShaderPass(TiltShift(true));
    this.tiltV = new ShaderPass(TiltShift(false));
    this.composer.addPass(this.tiltH);
    this.composer.addPass(this.tiltV);
    this.grade = new ShaderPass(Grade);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.fxaa = new FXAAPass();
    this.composer.addPass(this.fxaa);
  }

  /** Preferences changed: pick the level and re-apply everything. */
  configure(s: PostSettings): void {
    this.settings = s;
    if (s.quality !== 'auto') this.level = s.quality;
    this.frameTimes = [];
    this.cooldown = 5;
    this.applyLevel();
  }

  private applyLevel(): void {
    const L = LEVELS[this.level];
    const dpr = Math.min(window.devicePixelRatio || 1, L.pixelRatio);
    this.renderer.setPixelRatio(Math.max(0.5, dpr * this.settings.resolution));
    this.renderer.shadowMap.enabled = this.settings.shadows && this.level !== 'low';
    this.sun.castShadow = this.renderer.shadowMap.enabled;
    if (this.sun.shadow.mapSize.x !== L.shadowMap) {
      this.sun.shadow.mapSize.set(L.shadowMap, L.shadowMap);
      this.sun.shadow.map?.dispose();
      (this.sun.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
    }
    this.sun.shadow.radius = this.level === 'ultra' ? 3 : 2;
    this.target.samples = L.msaa;
    this.gtao.enabled = this.settings.ambientOcclusion && L.ao !== 'off';
    this.fxaa.enabled = L.msaa === 0;
    this.setSize(this.size.x, this.size.y);
  }

  setSize(w: number, h: number): void {
    this.size.set(w, h);
    this.composer.setSize(w, h);
    const px = this.renderer.getPixelRatio();
    for (const p of [this.tiltH, this.tiltV]) p.uniforms.uTexel.value.set(1 / (w * px), 1 / (h * px));
    // Half-resolution AO on "high" keeps it affordable.
    const aoScale = LEVELS[this.level].ao === 'half' ? 0.5 : 1;
    this.gtao.setSize(Math.max(1, w * px * aoScale), Math.max(1, h * px * aoScale));
  }

  /** Scale the miniature-lens blur (0 = off): the loading view and the intro
   *  look straight down, where a blurred top and bottom just look smeared. */
  setTiltAmount(k: number): void {
    this.tiltH.uniforms.uAmount.value = this.tiltV.uniforms.uAmount.value = k;
  }

  /** Night makes lamps and windows bloom more. */
  setNight(night01: number): void {
    this.bloom.strength = 0.25 + night01 * 0.55;
    this.bloom.threshold = 0.9 - night01 * 0.25;
  }

  render(dt: number): void {
    this.tiltH.enabled = this.tiltV.enabled = this.settings.tiltShift && this.level !== 'low';
    this.bloom.enabled = this.settings.bloom && this.level !== 'low';
    this.composer.render(dt);
    this.adapt(dt);
  }

  /** Hold the "auto" level (while models load, slow frames say nothing about the GPU). */
  holdLevel(on: boolean): void {
    this.held = on;
    this.frameTimes = [];
    this.cooldown = 5;
  }

  /** "auto": step down a level while frames run slower than ~32 fps. */
  private adapt(dt: number): void {
    if (this.settings.quality !== 'auto' || this.held) return;
    this.cooldown -= dt;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    if (this.cooldown > 0 || this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const i = ORDER.indexOf(this.level);
    if (avg > 1 / 32 && i > 0) {
      this.level = ORDER[i - 1];
      this.applyLevel();
      console.info('[sky] quality →', this.level);
      this.frameTimes = [];
      this.cooldown = 5;
    }
  }
}
