// Vodič: osnovna pravila FPL-a i kako koristiti aplikaciju.
export const title = 'Vodič';

export async function render() {
  return `<div class="head"><div><h1>Vodič</h1><p class="sub">Osnovna pravila Fantasy Premier League i kako čitati ovu aplikaciju</p></div></div>
    <section class="g card prose">
      <p>Pravila se mogu promijeniti od sezone do sezone. Uvijek provjeri zvanična pravila na fantasy.premierleague.com.</p>
      <h2>Tim</h2>
      <ul><li>15 igrača: 2 golmana, 5 odbrambenih, 5 veznih i 3 napadača.</li><li>Budžet na početku sezone je 100 miliona.</li><li>Najviše 3 igrača iz istog kluba.</li><li>Svako kolo biraš 11 koji igraju: 1 golman, najmanje 3 odbrambena i najmanje 1 napadač. Ostala četvorica su na klupi.</li></ul>
      <h2>Kapiten</h2>
      <p>Kapiten donosi duple bodove. Ako kapiten ne odigra nijednu minutu, duple bodove dobija vice kapiten.</p>
      <h2>Bodovi</h2>
      <ul><li>Igranje: 1 bod do 60 minuta, 2 boda za 60 i više.</li><li>Gol: što je pozicija odbrambenija, gol vrijedi više.</li><li>Asistencija: 3 boda.</li><li>Bez primljenog gola: 4 boda golman i odbrana, 1 bod vezni.</li><li>Bonus: 1 do 3 boda najboljim igračima utakmice.</li><li>Minus bodovi za kartone, autogol, promašen penal i primljene golove (golman i odbrana).</li></ul>
      <h2>Transferi</h2>
      <ul><li>Svako kolo dobiješ 1 besplatan transfer. Neiskorištene čuvaš, ali najviše 5.</li><li>Svaki transfer preko besplatnih košta 4 boda.</li><li>Kad prodaješ igrača koji je poskupio, dobiješ samo pola rasta cijene. Zato je prodajna cijena često malo niža od trenutne.</li><li>Rok za transfere je prije prve utakmice kola.</li></ul>
      <h2>Čipovi</h2>
      <ul><li><b>Wildcard</b>: neograničeni besplatni transferi to kolo, promjene ostaju.</li><li><b>Free Hit</b>: neograničeni transferi samo za jedno kolo, zatim se tim vraća.</li><li><b>Bench Boost</b>: bodovi igrača sa klupe se računaju.</li><li><b>Triple Captain</b>: kapiten donosi trostruke bodove.</li></ul>
      <h2>Kako čitati FPL Manager</h2>
      <ul><li><b>Predviđeni bodovi</b> su procjena iz forme, prosjeka, minutaže, očekivanih golova i asistencija, protivnika i domaćeg terena. Nisu sigurni, ali pomažu da uporediš igrače.</li><li><b>Boje protivnika</b>: zeleno lako, sivo srednje, crveno teško, tamnocrveno vrlo teško.</li><li><b>Šanse</b> (zelena strelica, dvoboj sa rivalom) dobijamo tako što kolo „odigramo” hiljadama puta oko predviđenih bodova.</li><li><b>Besplatni transferi</b> se računaju iz tvoje historije kola, pa provjeri broj i na FPL-u prije potvrde.</li></ul>
    </section>`;
}
