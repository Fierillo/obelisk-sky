// Dev-only viewer (client/people.html, not part of the build): a row of
// looks playing one clip each, to check fit, recolouring and animation.
import * as THREE from 'three';
import { buildPerson, defaultLook, loadLook, peopleClips, type PersonLook } from './people';
import { buildExerciseClip, type ExerciseKind } from '../world/anim/exercises';

const params = new URLSearchParams(location.search);
const clip = params.get('clip') ?? 'Walk_Loop';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ccbe8);
scene.add(new THREE.HemisphereLight(0xffffff, 0x557744, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3, 6, 4);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x6aa443 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
cam.position.set(0, Number(params.get('cy') ?? 1.6), Number(params.get('cz') ?? 9));
cam.lookAt(Number(params.get('lx') ?? 0), Number(params.get('ly') ?? 0.9), 0);

const looks: PersonLook[] = [];
for (let i = 0; i < 6; i++) looks.push(defaultLook(1000 + i * 7919));
looks[1] = { ...looks[1], body: 'm', outfit: 'ranger', hood: true };
looks[2] = { ...looks[2], body: 'f', outfit: 'peasant', hair: 'long', top: '#b4f953' };
looks[3] = { ...looks[3], body: 'f', outfit: 'ranger', hood: false, hair: 'buns' };
looks[4] = { ...looks[4], body: 'm', outfit: 'peasant', hair: 'simpleparted', beard: true, skin: 'dark', skinTint: '#ffffff' };
const mixers: THREE.AnimationMixer[] = [];
await Promise.all(looks.map(loadLook));
looks.forEach((look, i) => {
  const p = buildPerson(look)!;
  if (params.has('nobody')) p.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && /Superhero/.test(((o as THREE.Mesh).material as THREE.Material).name)) o.visible = false; });
  p.root.position.x = (i - 2.5) * 1.1;
  p.root.rotation.y = params.has('back') ? Math.PI : params.has('side') ? Math.PI / 2 : 0;
  scene.add(p.root);
  const mixer = new THREE.AnimationMixer(p.root);
  const ex = params.get('ex') as ExerciseKind | null;
  const grip = Number(params.get('grip') ?? 0);
  let c = peopleClips().find((x) => x.name === clip);
  if (ex) {
    const half = params.has('half') ? Number(params.get('half')) : undefined;
    c = buildExerciseClip(ex, buildPerson(look)!.root, grip, undefined, half);
    const barMat = new THREE.MeshStandardMaterial({ color: 0x8d969e, metalness: 0.6, roughness: 0.4 });
    if (ex === 'dip') {
      for (const sx of [-1, 1]) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.6, 10), barMat);
        bar.rotation.x = Math.PI / 2;
        bar.position.set(p.root.position.x + sx * (half ?? 0.3), grip, 0);
        scene.add(bar);
      }
    } else if (grip > 0) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.0, 10), barMat);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(p.root.position.x, grip, 0);
      scene.add(bar);
    }
  }
  if (c) mixer.clipAction(c).play();
  mixer.update(Number(params.get('t') ?? 0.3) + i * 0.1);
  mixers.push(mixer);
});
(window as unknown as { __ready: boolean; __THREE: unknown }).__THREE = THREE;
(window as unknown as { __ready: boolean }).__ready = true;
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (!params.has('still')) for (const m of mixers) m.update(dt);
  renderer.render(scene, cam);
});
