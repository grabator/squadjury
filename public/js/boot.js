// Pokreće preuzimanje podataka odmah, dok se ostatak aplikacije još učitava. api.js ih preuzima iz window.__pre.
(function () {
  var q = new URLSearchParams(location.search), id = q.get('id'), demo = q.get('demo') === '1';
  try {
    if (!id && !demo) { id = localStorage.getItem('fm-id'); demo = localStorage.getItem('fm-demo') === '1'; }
  } catch (e) { /* bez spremnika */ }
  if (demo && !id) id = '1';
  if (!id || !/^\d{1,9}$/.test(id)) return;
  var pre = window.__pre = {};
  ['/bootstrap', '/fixtures', '/team/' + id].forEach(function (p) {
    var url = '/api' + p + (demo ? '?demo=1' : '');
    pre[url] = fetch(url);
  });
})();
