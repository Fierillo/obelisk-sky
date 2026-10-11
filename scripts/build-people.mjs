// Characters for the village, from Quaternius' CC0 packs in _dl/quaternius
// (Universal Base Characters, Modular Character Outfits - Fantasy, Universal
// Animation Library 1 and 2, all [Standard], all on one 65-bone skeleton).
// Each source is re-exported as a small GLB: textures to WebP (colour 1024,
// normals 512), meshes and animations meshopt-compressed, unused data pruned.
// Animations ship once, without any mesh, in anims.glb.
//
//   node scripts/build-people.mjs   →  client/public/models/people/*

import { mkdirSync, copyFileSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const Q = '_dl/quaternius';
const UBC = `${Q}/Universal Base Characters[Standard]`;
const OUT_FIT = `${Q}/Modular Character Outfits - Fantasy[Standard]/Exports/glTF (Godot-Unreal)/Outfits`;
const HAIR = `${UBC}/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)`;
const OUT = 'client/public/models/people';
mkdirSync(OUT, { recursive: true });

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

/** Drop roughness/metal/occlusion maps: the village's lighting is soft and they cost the most bytes. */
function simplifyMaterials(doc) {
  for (const m of doc.getRoot().listMaterials()) {
    m.setMetallicRoughnessTexture(null);
    m.setOcclusionTexture(null);
    m.setMetallicFactor(0);
    m.setRoughnessFactor(0.85);
  }
}

async function shrink(doc) {
  simplifyMaterials(doc);
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(?!normal)/, resize: [1024, 1024], quality: 82 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /normal/, resize: [512, 512], quality: 85 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
}

/**
 * Some of the packs' glTFs name textures that sit elsewhere or under a
 * slightly different name (`T_Hair_1_Normal_png.png` for `T_Hair_1_Normal.png`).
 * Copy the real file in beside the glTF under the name it asks for.
 */
const TEXTURE_DIRS = [];
function findAll(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) findAll(p);
    else if (/\.png$/i.test(e.name)) TEXTURE_DIRS.push(p);
  }
}
findAll(Q);
function fixTextures(gltfPath) {
  if (!gltfPath.endsWith('.gltf')) return;
  const j = JSON.parse(readFileSync(gltfPath, 'utf8'));
  for (const img of j.images ?? []) {
    if (!img.uri) continue;
    const want = join(dirname(gltfPath), decodeURIComponent(img.uri));
    if (existsSync(want)) continue;
    const name = basename(want);
    const candidates = [name, name.replace(/_png\.png$/i, '.png'), name.replace(/\.png$/i, '_png.png')];
    const hit = TEXTURE_DIRS.find((p) => candidates.includes(basename(p)));
    if (!hit) throw new Error(`no texture for ${name} (${gltfPath})`);
    copyFileSync(hit, want);
  }
}

async function exportModel(src, out) {
  fixTextures(src);
  const doc = await io.read(src);
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  await shrink(doc);
  await io.write(join(OUT, out), doc);
  console.log('wrote', out);
}

// Bodies.
await exportModel(`${UBC}/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf`, 'body-m.glb');
await exportModel(`${UBC}/Base Characters/Godot - UE/Superhero_Female_FullBody.gltf`, 'body-f.glb');
// The other skin tone of each body, swapped in at runtime.
const TEX = `${UBC}/Base Characters/Textures`;
for (const [src, out] of [
  ['T_Superhero_Male_Ligh.png', 'skin-m-light.webp'],
  ['T_Superhero_Male_Dark.png', 'skin-m-dark.webp'],
  ['T_Superhero_Female_Light_BaseColor.png', 'skin-f-light.webp'],
  ['T_Superhero_Female_Dark_BaseColor.png', 'skin-f-dark.webp'],
]) {
  await sharp(join(TEX, src)).resize(1024, 1024).webp({ quality: 82 }).toFile(join(OUT, out));
  console.log('wrote', out);
}
// Outfits.
for (const sex of ['Male', 'Female']) {
  for (const kind of ['Peasant', 'Ranger']) {
    await exportModel(`${OUT_FIT}/${sex}_${kind}.gltf`, `outfit-${sex[0].toLowerCase()}-${kind.toLowerCase()}.glb`);
  }
}
// Hair (rigged to the head bone) and eyebrows.
for (const h of ['Hair_Beard', 'Hair_Buns', 'Hair_Buzzed', 'Hair_BuzzedFemale', 'Hair_Long', 'Hair_SimpleParted', 'Eyebrows_Female', 'Eyebrows_Regular']) {
  await exportModel(`${HAIR}/${h}.gltf`, `${h.toLowerCase().replace(/_/g, '-')}.glb`);
}

// Animations: the clips the village plays, from both libraries, no meshes.
const KEEP = {
  'Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb': [
    'Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land',
    'Sitting_Enter', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Sitting_Exit', 'Idle_Talking_Loop',
    'Interact', 'Dance_Loop', 'PickUp_Table', 'Crouch_Idle_Loop',
  ],
  'Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb': [
    'Yes', 'Idle_No_Loop', 'Idle_FoldArms_Loop', 'Consume',
  ],
};
let n = 0;
for (const [src, keep] of Object.entries(KEEP)) {
  const doc = await io.read(join(Q, src));
  const root = doc.getRoot();
  const dropSampler = (smp) => {
    if (!smp) return;
    const acc = [smp.getInput(), smp.getOutput()];
    smp.dispose();
    for (const x of acc) if (x && x.listParents().every((p) => p === root)) x.dispose();
  };
  for (const a of root.listAnimations()) {
    if (keep.includes(a.getName())) continue;
    for (const smp of a.listSamplers()) dropSampler(smp);
    a.dispose();
  }
  // Fingers are 40 of the 65 bones: keep the first knuckle of each (the
  // hand's curl) and let the rest follow the bind pose. Bones other than the
  // root and pelvis don't move, so their translation tracks go too.
  for (const a of root.listAnimations()) {
    for (const ch of a.listChannels()) {
      const bone = ch.getTargetNode()?.getName() ?? '';
      const finger = /^(index|middle|pinky|ring|thumb)_0[234]/.test(bone);
      const fixedTranslation = ch.getTargetPath() === 'translation' && !['root', 'pelvis'].includes(bone);
      if (finger || fixedTranslation) { const smp = ch.getSampler(); ch.dispose(); dropSampler(smp); }
    }
  }
  for (const node of root.listNodes()) node.setMesh(null);
  for (const m of root.listMeshes()) m.dispose();
  for (const s of root.listSkins()) s.dispose();
  await doc.transform(resample(), dedup(), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = `anims-${++n}.glb`;
  await io.write(join(OUT, out), doc);
  console.log('wrote', out, root.listAnimations().map((a) => a.getName()).join(', '));
}

copyFileSync(`${UBC}/License_Standard.txt`, join(OUT, 'LICENSE-quaternius.txt'));
writeFileSync(join(OUT, 'README.txt'),
  'Characters, outfits, hair and animations by Quaternius (quaternius.com), CC0 1.0.\n'
  + 'Universal Base Characters, Modular Character Outfits - Fantasy, Universal Animation Library 1 and 2 (Standard).\n'
  + 'Re-exported by scripts/build-people.mjs.\n');
