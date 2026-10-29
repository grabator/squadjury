import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageNumbers } from '../../../public/jury/js/ui.js';

test('pager: first, last and current page, never more than 5 entries, gaps as null', () => {
  assert.deepEqual(pageNumbers(1, 1), [1]);
  assert.deepEqual(pageNumbers(1, 3), [1, 2, 3]);
  assert.deepEqual(pageNumbers(1, 10), [1, 2, 3, null, 10]);
  assert.deepEqual(pageNumbers(5, 10), [1, null, 5, null, 10]);
  assert.deepEqual(pageNumbers(10, 10), [1, null, 8, 9, 10]);
  for (let pages = 1; pages <= 40; pages++) {
    for (let page = 1; page <= pages; page++) {
      const n = pageNumbers(page, pages);
      assert.ok(n.length <= 5, `${page}/${pages}: ${n}`);
      assert.ok(n.includes(page) && n.includes(1) && n.includes(pages));
    }
  }
});
