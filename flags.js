// Rasterized from flag-icons 7.6.0 (MIT). See flags/LICENSE.txt.
const flagCodes = `ar at au ba be bf br ca
cd ch ci cl cm co cr cz
de dk dz ec eg es fr gb-eng
gb-nir gb-sct gb-wls gr hr hu ie iq
ir it jp kr ma ml mx ng
nl no pa pe pl pt py qa
ro rs ru sa se si sk sn
tn tr ua us uy uz ve za`.split(/\s+/);
const tiles = new Map(flagCodes.map((code, i) => [code, i]));
const atlas = typeof Image === 'undefined' ? null : new Image();
if (atlas) atlas.src = new URL('./flags/world-cup.png', import.meta.url).href;

export function drawFlag(ctx, team, x, y, w, h) {
  const tile = tiles.get(team.flag);
  if (tile === undefined || !atlas?.complete || !atlas.naturalWidth) return;
  const width = Math.min(w, h * 4 / 3);
  const height = width * 3 / 4;
  ctx.drawImage(atlas, (tile % 8) * 132 + 2, Math.floor(tile / 8) * 100 + 2, 128, 96,
    x + (w - width) / 2, y + (h - height) / 2, width, height);
}
