// Vodič: osnovna pravila FPL-a i kako koristiti aplikaciju.
import { tr } from '../i18n.js';

export const title = tr('Vodič', 'Guide');

const BS = `<div class="head"><div><h1>Vodič</h1><p class="sub">Osnovna pravila Fantasy Premier League i kako čitati ovu aplikaciju</p></div></div>
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
      <h2>Kako čitati SquadJury</h2>
      <ul><li><b>Predviđeni bodovi</b> su procjena iz forme, prosjeka, minutaže, očekivanih golova i asistencija, protivnika i domaćeg terena. Nisu sigurni, ali pomažu da uporediš igrače.</li><li><b>Boje protivnika</b>: zeleno lako, sivo srednje, crveno teško, tamnocrveno vrlo teško.</li><li><b>Šanse</b> (zelena strelica, dvoboj sa rivalom) dobijamo tako što kolo „odigramo” hiljadama puta oko predviđenih bodova.</li><li><b>Besplatni transferi</b> se računaju iz tvoje historije kola, pa provjeri broj i na FPL-u prije potvrde.</li></ul>
    </section>`;

const EN = `<div class="head"><div><h1>Guide</h1><p class="sub">The basic Fantasy Premier League rules and how to read this app</p></div></div>
    <section class="g card prose">
      <p>Rules can change from season to season. Always check the official rules on fantasy.premierleague.com.</p>
      <h2>Squad</h2>
      <ul><li>15 players: 2 goalkeepers, 5 defenders, 5 midfielders and 3 forwards.</li><li>The budget at the start of the season is 100 million.</li><li>At most 3 players from the same club.</li><li>Every gameweek you pick the 11 who play: 1 goalkeeper, at least 3 defenders and at least 1 forward. The other four sit on the bench.</li></ul>
      <h2>Captain</h2>
      <p>Your captain scores double points. If the captain plays no minutes, the vice captain gets the double points.</p>
      <h2>Points</h2>
      <ul><li>Playing: 1 point for up to 60 minutes, 2 points for 60 or more.</li><li>Goals: the more defensive the position, the more a goal is worth.</li><li>Assist: 3 points.</li><li>Clean sheet: 4 points for goalkeepers and defenders, 1 point for midfielders.</li><li>Bonus: 1 to 3 points for the best players in a match.</li><li>Minus points for cards, own goals, missed penalties and goals conceded (goalkeepers and defenders).</li></ul>
      <h2>Transfers</h2>
      <ul><li>You get 1 free transfer every gameweek. Unused ones roll over, up to 5.</li><li>Every transfer beyond your free ones costs 4 points.</li><li>When you sell a player who has risen in price, you only get half of the rise. That is why the selling price is often a bit below the current price.</li><li>The transfer deadline is before the first match of the gameweek.</li></ul>
      <h2>Chips</h2>
      <ul><li><b>Wildcard</b>: unlimited free transfers that gameweek, the changes stay.</li><li><b>Free Hit</b>: unlimited transfers for one gameweek only, then your team reverts.</li><li><b>Bench Boost</b>: your bench players' points count.</li><li><b>Triple Captain</b>: your captain scores triple points.</li></ul>
      <h2>How to read SquadJury</h2>
      <ul><li><b>Predicted points</b> are an estimate from form, average, minutes, expected goals and assists, the opponent and home advantage. They are not certain, but they help you compare players.</li><li><b>Opponent colours</b>: green easy, grey medium, red hard, dark red very hard.</li><li><b>Chances</b> (green arrow, head to head with a rival) come from "playing" the gameweek thousands of times around the predicted points.</li><li><b>Free transfers</b> are worked out from your gameweek history, so check the number on FPL before you confirm.</li></ul>
    </section>`;

export async function render() {
  return tr(BS, EN);
}
