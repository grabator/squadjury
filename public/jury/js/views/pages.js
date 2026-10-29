// Static pages: How it works, Rules, Privacy and the 404 page.

import { t, getLang } from '../i18n.js';
import { html } from '../ui.js';

const PAGES_EN = {
  how: () => html`<div class="prose">
    <h1 class="title">${t('page.how')}</h1>
    <p class="sub">Post your squad. The jury decides.</p>
    <button class="btn" data-intro>${t('intro.again')}</button>
    <h2>1. Post your squad</h2>
    <p>Sign in with Google or with a link we email you, then upload a screenshot of the <strong>Pick Team</strong> screen from the official FPL app. SquadJury reads your 15 players, captain and vice captain right in your browser. Check them, fix anything we missed and send your squad to the jury.</p>
    <h2>2. Judge other squads</h2>
    <p>Squads appear one at a time. Tap <strong>how good the squad will be this gameweek</strong>, from 1 (flop) to 10 (haul), and the next one comes up. Fixtures, captain, differentials, the bench: your call, that is what a jury is for. You see the jury average only after you give your own verdict, and nobody ever sees who gave which verdict.</p>
    <h2>3. Climb the leaderboard</h2>
    <p>Verdicts stay open until the FPL deadline of the gameweek. At the deadline the gameweek locks and the final top 10 is saved on the leaderboard.</p>
    <h2>4. See the real points</h2>
    <p>When the gameweek is over, SquadJury adds up the real FPL points of every squad: the starting XI, the captain doubled and automatic substitutions from the bench. Then you see if the jury got it right. Add your <strong>FPL team ID</strong> in your profile and your exact points from FPL are used, with transfer hits and chips.</p>
    <h2>Scout points</h2>
    <p>Your verdict is also a forecast. After the gameweek every squad gets a true score from 1 to 10 by its real FPL points (the best squad 10, the worst 1). A verdict right on it earns 10 scout points, 1 away 8, 2 away 6, 3 away 3, more than that 0. A duel pick earns 5 when the squad you picked scored more. Your scout score for the gameweek is the average, once you gave at least 10 verdicts. The season adds up the gameweeks. See it under Scouts on the leaderboard and on your profile.</p>
    <h2>Badges and streak</h2>
    <p>There are 18 badges for jurors, managers, scouts, duels and bringing friends. Your profile shows the ones you unlocked; tap the row to see all of them, with how far you are on each. Your streak counts the gameweeks in a row in which you gave at least 5 verdicts or duels. Miss a gameweek and it starts again, but your best streak stays.</p>
    <h2>Duels</h2>
    <p>Switch Judge to <strong>Duel</strong> and you see two squads at once. Tap the better one. Every pick moves the squads' duel rating (it starts at 1500, like chess ratings) and their win and loss record, shown on the leaderboard under Duels. A duel counts as one judged squad. Picks made in under a second, or always on the same side, do not move the rating.</p>
    <h2>Plan A vs Plan B</h2>
    <p>Not sure about a transfer or the captain? After posting your squad, add Plan B. Jurors see both in Duel mode and pick the plan they would go with. Choose your plan at least 30 minutes before the deadline, otherwise the plan with more votes goes in. These votes never change the leaderboard.</p>
    <h2>Private leagues</h2>
    <p>Make a league for your friends, your office or your mini league, and share its link or 6 character code. Everyone in it gets their own table every gameweek and for the season. The verdicts are the same as on the main leaderboard, so nobody can boost a friend just inside the league.</p>
    <p>With 4 or more members the league also plays <strong>head to head</strong>: every gameweek you meet one member, like an FPL H2H league. The jury result is who won more duels between the two squads (with fewer than 3 duel votes, the better jury rating wins). The points result comes after the gameweek, from real FPL points. A win is 3 points and a draw 1, in a Jury table and a Points table. No squad by the deadline loses 0:3.</p>
    <h2>Share it</h2>
    <p>Every squad has its own link. Send it to your mini league, or post the square image of your squad on X with one tap.</p>
    <p>Have a blog or a channel? On My squad, <strong>Embed</strong> gives you a code to show your squad on your own website, where visitors can rate it, and a 1920x1080 image with a QR code for your YouTube video.</p>
  </div>`,
  rules: () => html`<div class="prose">
    <h1 class="title">${t('page.rules')}</h1>
    <h2>Squads</h2>
    <ul>
      <li>One squad per account per gameweek. You can replace the screenshot until the deadline, which resets its verdicts.</li>
      <li>The squad must follow FPL rules: 2 goalkeepers, 5 defenders, 5 midfielders, 3 forwards and at most 3 players from one club.</li>
      <li>Post your own squad, from the Pick Team screen. Anything else can be reported and removed.</li>
    </ul>
    <h2>Verdicts</h2>
    <ul>
      <li>One verdict per squad, from 1 to 10. You can change it until the deadline.</li>
      <li>You cannot judge your own squad.</li>
      <li>Verdicts are anonymous to squad owners.</li>
      <li>A verdict says how good the squad will be this gameweek: 1 a flop, 10 a haul. After the gameweek it is scored against the real points (scout points). Giving everyone the same verdict does not score well.</li>
      <li>Scout scores need at least 10 verdicts in the gameweek, and are not worked out when fewer than 10 squads have points.</li>
    </ul>
    <h2>The leaderboard</h2>
    <p>A squad needs <strong>at least 5 verdicts</strong>, and its owner needs to judge <strong>at least 5 other squads</strong> that gameweek (or every other squad, while there are fewer), to be ranked. A duel counts as one judged squad.</p>
    <p><strong>How the rank is worked out:</strong> more verdicts make a score more reliable, so a squad with only a few verdicts needs high marks from more people to reach the top. Technically, each average is blended with the gameweek average as if it had 5 extra votes at that average. The leaderboard shows the real average.</p>
    <h2>Duels</h2>
    <p>The duel rating starts at 1500 and moves after every duel (Elo, K 24): beating a higher rated squad moves it more. A squad needs 5 duels to be listed. You can judge up to 200 duels per gameweek and each pair only once. Nobody ever sees who picked which squad.</p>
    <h2>Fair play</h2>
    <ul>
      <li>Accounts that only ever give 1 or 10 count for half.</li>
      <li>Duel picks made in under a second, or nearly always on the same side, do not move the duel rating.</li>
      <li>Verdicts are rate limited, and squads reported 3 times are hidden until reviewed.</li>
      <li>Accounts that cheat are banned.</li>
    </ul>
  </div>`,
  privacy: () => html`<div class="prose">
    <h1 class="title">${t('page.privacy')}</h1>
    <p>SquadJury keeps as little as it can.</p>
    <h2>What we store</h2>
    <ul>
      <li><strong>Account:</strong> your email and, if you use them, your Google or Apple account id (to sign you in, never shown to anyone). Sign in links are stored only as a fingerprint and expire after 15 minutes. your nickname and the optional X username you add.</li>
      <li><strong>Squads:</strong> the players you post and your screenshot. Screenshots are deleted two gameweeks later, unless the squad finished in the top 10.</li>
      <li><strong>Verdicts:</strong> the scores you give. Owners only see averages and totals.</li>
      <li><strong>Technical:</strong> a session cookie that keeps you signed in for 90 days, and short lived counters used to stop spam.</li>
    </ul>
    <h2>What we never do</h2>
    <p>No ads, no tracking scripts and no selling of data. Screenshots are read in your browser; only the image you post is uploaded.</p>
    <h2>Delete your data</h2>
    <p>Go to <a href="/jury/me">Me</a> and choose <strong>Delete my account</strong>. Your account, squads, screenshots and verdicts are removed straight away.</p>
    <p>${t('footer.fan')}</p>
  </div>`,
  404: () => html`<div class="empty"><span class="ycard"></span>
    <h1 class="title" style="margin-bottom:8px">${t('page.notFound')}</h1><p>${t('page.notFoundText')}</p>
    <a class="btn btn-go" href="/jury/">${t('page.home')}</a></div>`,
};

// bosanske verzije istih stranica
const PAGES_BS = {
  how: () => html`<div class="prose">
    <h1 class="title">${t('page.how')}</h1>
    <p class="sub">Objavi svoj tim. Žiri odlučuje.</p>
    <button class="btn" data-intro>${t('intro.again')}</button>
    <h2>1. Objavi svoj tim</h2>
    <p>Prijavi se preko Googlea ili linka koji ti pošaljemo na email, pa ubaci screenshot ekrana <strong>Pick Team</strong> iz zvanične FPL aplikacije. SquadJury pročita tvojih 15 igrača, kapitena i vice kapitena direktno u tvom pregledniku. Provjeri ih, ispravi ako smo nešto promašili i pošalji tim žiriju.</p>
    <h2>2. Ocjenjuj tuđe timove</h2>
    <p>Timovi se pojavljuju jedan po jedan. Dodirni <strong>koliko će tim biti dobar ovo kolo</strong>, od 1 (promašaj) do 10 (pun pogodak), i stiže sljedeći. Protivnici, kapiten, diferencijali, klupa: ti odlučuješ, za to i postoji žiri. Prosjek žirija vidiš tek kad daš svoju ocjenu, a niko nikad ne vidi ko je dao koju ocjenu.</p>
    <h2>3. Penji se na tabeli</h2>
    <p>Ocjene su otvorene do FPL roka za kolo. U rok se kolo zaključava i konačni top 10 ostaje sačuvan na tabeli.</p>
    <h2>4. Vidi stvarne bodove</h2>
    <p>Kad se kolo završi, SquadJury sabere stvarne FPL bodove svakog tima: prvih 11, dupli kapiten i automatske zamjene sa klupe. Onda vidiš da li je žiri bio u pravu. Dodaj svoj <strong>FPL ID tima</strong> u profilu i koriste se tvoji tačni bodovi iz FPL-a, sa minus bodovima i čipovima.</p>
    <h2>Skaut bodovi</h2>
    <p>Tvoja ocjena je i prognoza. Poslije kola svaki tim dobije pravu ocjenu od 1 do 10 po stvarnim FPL bodovima (najbolji tim 10, najslabiji 1). Ocjena tačno na nju donosi 10 skaut bodova, za 1 promašaj 8, za 2 je 6, za 3 je 3, a više od toga 0. Izbor u duelu donosi 5 kad tim koji si izabrao osvoji više. Tvoj skaut rezultat za kolo je prosjek, kad daš bar 10 ocjena. Sezona sabira kola. Vidi ga pod Skauti na tabeli i na svom profilu.</p>
    <h2>Značke i niz</h2>
    <p>Ima 18 znački za porotnike, menadžere, skaute, duele i dovođenje prijatelja. Profil pokazuje one koje si otključao; dodirni red da vidiš sve, i koliko ti fali za svaku. Niz broji kola zaredom u kojima si dao bar 5 ocjena ili duela. Propustiš li kolo, kreće ispočetka, ali najbolji niz ostaje.</p>
    <h2>Dueli</h2>
    <p>Prebaci Ocjenjuj na <strong>Duel</strong> i vidiš dva tima odjednom. Dodirni bolji. Svaki izbor pomjera duel rejting timova (kreće od 1500, kao šahovski rejting) i njihov omjer pobjeda i poraza, koji se vidi na tabeli pod Dueli. Duel se računa kao jedan ocijenjen tim. Izbori brži od jedne sekunde, ili uvijek na istu stranu, ne pomjeraju rejting.</p>
    <h2>Plan A protiv Plana B</h2>
    <p>Nisi siguran za transfer ili kapitena? Kad objaviš tim, dodaj Plan B. Porotnici vide oba u duelima i biraju plan koji bi oni izabrali. Izaberi svoj plan najkasnije 30 minuta prije roka, inače ide plan sa više glasova. Ovi glasovi nikad ne mijenjaju tabelu.</p>
    <h2>Privatne lige</h2>
    <p>Napravi ligu za prijatelje, kolege ili svoju mini ligu i podijeli njen link ili kod od 6 znakova. Svi u njoj dobiju svoju tabelu za svako kolo i za sezonu. Ocjene su iste kao na glavnoj tabeli, pa niko ne može pogurati prijatelja samo unutar lige.</p>
    <p>Sa 4 ili više članova liga igra i <strong>jedan na jedan</strong>: svako kolo igraš protiv jednog člana, kao u FPL H2H ligi. Rezultat žirija je ko je dobio više duela između ta dva tima (sa manje od 3 glasa u duelu pobjeđuje bolja ocjena žirija). Rezultat po bodovima stiže poslije kola, iz stvarnih FPL bodova. Pobjeda je 3 boda, neriješeno 1, u tabeli žirija i tabeli bodova. Ko nema tim do roka, gubi 0:3.</p>
    <h2>Podijeli</h2>
    <p>Svaki tim ima svoj link. Pošalji ga svojoj mini ligi, ili objavi kvadratnu sliku svog tima na X jednim dodirom.</p>
    <p>Imaš blog ili kanal? Na Moj tim, <strong>Ugradi</strong> ti daje kod da pokažeš tim na svojoj stranici, gdje ga posjetioci mogu ocijeniti, i sliku 1920x1080 sa QR kodom za tvoj YouTube video.</p>
  </div>`,
  rules: () => html`<div class="prose">
    <h1 class="title">${t('page.rules')}</h1>
    <h2>Timovi</h2>
    <ul>
      <li>Jedan tim po računu po kolu. Screenshot možeš zamijeniti do roka, a to briše njegove ocjene.</li>
      <li>Tim mora poštovati FPL pravila: 2 golmana, 5 odbrambenih, 5 veznih, 3 napadača i najviše 3 igrača iz jednog kluba.</li>
      <li>Objavi svoj tim, sa ekrana Pick Team. Sve drugo se može prijaviti i ukloniti.</li>
    </ul>
    <h2>Ocjene</h2>
    <ul>
      <li>Jedna ocjena po timu, od 1 do 10. Možeš je promijeniti do roka.</li>
      <li>Ne možeš ocijeniti svoj tim.</li>
      <li>Vlasnici timova ne vide ko je dao koju ocjenu.</li>
      <li>Ocjena govori koliko će tim biti dobar ovo kolo: 1 promašaj, 10 pun pogodak. Poslije kola poredi se sa stvarnim bodovima (skaut bodovi). Ako svima daješ istu ocjenu, nećeš dobro proći.</li>
      <li>Skaut rezultat traži bar 10 ocjena u kolu, i ne računa se kad manje od 10 timova ima bodove.</li>
    </ul>
    <h2>Tabela</h2>
    <p>Da bi ušao u poredak, tim treba <strong>najmanje 5 ocjena</strong>, a njegov vlasnik treba to kolo ocijeniti <strong>najmanje 5 drugih timova</strong> (ili sve ostale, dok ih ima manje). Duel se računa kao jedan ocijenjen tim.</p>
    <p><strong>Kako se računa poredak:</strong> više ocjena čini rezultat pouzdanijim, pa tim sa samo par ocjena treba visoke ocjene od više ljudi da dođe do vrha. Tehnički, svaki prosjek se miješa sa prosjekom kola kao da ima još 5 glasova sa tim prosjekom. Tabela pokazuje pravi prosjek.</p>
    <h2>Dueli</h2>
    <p>Duel rejting kreće od 1500 i mijenja se poslije svakog duela (Elo, K 24): pobjeda nad timom sa većim rejtingom ga više pomjeri. Tim treba 5 duela da bude na listi. Možeš ocijeniti do 200 duela po kolu i svaki par samo jednom. Niko nikad ne vidi ko je izabrao koji tim.</p>
    <h2>Fer igra</h2>
    <ul>
      <li>Računi koji daju samo 1 ili 10 vrijede pola.</li>
      <li>Izbori u duelu brži od jedne sekunde, ili skoro uvijek na istu stranu, ne pomjeraju duel rejting.</li>
      <li>Broj ocjena je ograničen, a timovi prijavljeni 3 puta se sakrivaju dok se ne pregledaju.</li>
      <li>Računi koji varaju se zabranjuju.</li>
    </ul>
  </div>`,
  privacy: () => html`<div class="prose">
    <h1 class="title">${t('page.privacy')}</h1>
    <p>SquadJury čuva što manje može.</p>
    <h2>Šta čuvamo</h2>
    <ul>
      <li><strong>Račun:</strong> tvoj email i, ako ih koristiš, id tvog Google ili Apple računa (da te prijavimo, nikad se nikome ne prikazuje). Linkovi za prijavu se čuvaju samo kao otisak i ističu poslije 15 minuta. Tvoj nadimak i X korisničko ime ako ga dodaš.</li>
      <li><strong>Timovi:</strong> igrači koje objaviš i tvoj screenshot. Screenshotovi se brišu dva kola kasnije, osim ako je tim završio u top 10.</li>
      <li><strong>Ocjene:</strong> ocjene koje daješ. Vlasnici vide samo prosjeke i zbirove.</li>
      <li><strong>Tehnički:</strong> kolačić sesije koji te drži prijavljenim 90 dana, i kratkotrajni brojači protiv spama.</li>
    </ul>
    <h2>Šta nikad ne radimo</h2>
    <p>Nema reklama, nema skripti za praćenje i nema prodaje podataka. Screenshotovi se čitaju u tvom pregledniku; šalje se samo slika koju objaviš.</p>
    <h2>Obriši svoje podatke</h2>
    <p>Idi na <a href="/jury/me">Ja</a> i izaberi <strong>Obriši moj račun</strong>. Tvoj račun, timovi, screenshotovi i ocjene se odmah brišu.</p>
    <p>${t('footer.fan')}</p>
  </div>`,
};
const PAGES = getLang() === 'bs' ? { ...PAGES_EN, ...PAGES_BS } : PAGES_EN;

export function mount(el, which) {
  const page = PAGES[which] || PAGES[404];
  el.innerHTML = page().s;
  el.querySelector('[data-intro]')?.addEventListener('click', () => import('../intro.js').then((m) => m.showIntro({ force: true })));
  document.title = `${which === '404' ? t('page.notFound') : t(`page.${which}`)} | SquadJury`;
}

