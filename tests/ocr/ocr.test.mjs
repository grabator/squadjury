// Reads real Pick Team screenshots end to end (about 2 to 5 seconds each).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile, stop } from './node-ocr.mjs';
import { fileURLToPath } from 'node:url';

const snap = JSON.parse(readFileSync(new URL('../../src/data/fpl-snapshot.json', import.meta.url)));
after(stop);

const cases = [
  {
    file: 'pick-team-1.jpg',
    xi: ['Leno', 'Dalot', 'Calafiori', 'Maitland-Niles', 'Saka', 'Anthony', 'Eze', 'Gibbs-White', 'Rogers', 'Barry', 'Wissa'],
    bench: ['Kinsky', 'Haaland', 'Ajer', 'Van Hecke'],
    captain: 'Saka', vice: 'Anthony',
  },
  {
    file: 'pick-team-2.jpg',
    xi: ['Leno', 'Hall', 'Calafiori', 'Maitland-Niles', 'Saka', 'Eze', 'Barnes', 'Gibbs-White', 'Rogers', 'Barry', 'Gonzalo'],
    bench: ['Kinsky', 'Haaland', 'Silva', 'Mitchell'],
    captain: 'Saka', vice: 'Barnes',
  },
  {
    // Newer app layout: a pitch line through the midfield names, a yellow (flagged) name,
    // "Groß" and a cut short "Calvert-Le...".
    file: 'pick-team-3.jpg', gw: 7,
    xi: ['Verbruggen', 'De Cuyper', 'Calafiori', 'Konsa', 'Gibbs-White', 'B.Fernandes', 'Groß', 'Barnes', 'Schade', 'Haaland', 'João Pedro'],
    bench: ['Kinsky', 'Muharemović', 'Calvert-Lewin', 'Shaw'],
    captain: 'De Cuyper', vice: 'B.Fernandes',
  },
];

for (const c of cases) {
  test(`reads all 15 players from ${c.file}`, async () => {
    const s = await readFile(fileURLToPath(new URL(`../fixtures/${c.file}`, import.meta.url)), { ...snap, hintGw: c.gw });
    const name = (id) => snap.players.find((p) => p.id === id)?.web_name;
    assert.equal(s.recognised, 15);
    assert.equal(s.ok, true, JSON.stringify(s.problems));
    assert.equal(s.gw, c.gw ?? 6, 'gameweek guessed from the fixture labels');
    assert.deepEqual(s.picks.filter((p) => !p.bench).map((p) => p.name), c.xi);
    assert.deepEqual(s.picks.filter((p) => p.bench).map((p) => p.name), c.bench);
    assert.equal(name(s.captain), c.captain);
    assert.equal(name(s.vice), c.vice);
  });
}
