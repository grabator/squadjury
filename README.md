# SquadJury (FPL dio i ocjenjivanje timova)

Dashboard za Fantasy Premier League menadžere. Upišeš svoj FPL ID (bez lozinke) i dobiješ pregled sezone, prijedlog kapitena, transfere sa procjenom bodova, raspored kola i tabelu svoje lige.

## Šta radi (verzija 0.5)

Dizajn u bojama Premier lige (ljubičasta, zelena, cijan, roza) sa staklenim panelima. Na računaru je bočni meni, a na mobitelu donja traka sa 4 glavna ekrana i dugme „Više”.

**Tim**
- **Pregled:** odbrojavanje do roka za transfere, broj besplatnih transfera, rang, bodovi po kolima u odnosu na prosjek, utakmice kola, prijedlog kapitena, preporučeni transfer, šansa za zelenu strelicu i upozorenja.
- **Moj tim:** teren sa prvih 11 i klupom, prekidač između tvoje i predložene postave (najbolja formacija po predviđenim bodovima) i „Kolo X unazad”: koja bi postava bila najbolja.
- **Kapiten:** kandidati po predviđenim bodovima sa razlogom, druga opcija, igrač kojeg malo ko bira i šansa za zelenu strelicu po kapitenu.
- **Transferi:** broj besplatnih transfera (do 5), pojedinačni transferi i kombinacije od dva, ocjena da li se minus 4 isplati, simulator „Šta ako zamijenim?” i igrači u usponu.
- **Raspored:** težina protivnika tvojih igrača za 8 kola, svi klubovi poredani po lakoći, nagle promjene rasporeda i dupla ili prazna kola.

**Kolo**
- **Uživo:** bodovi u kolu, šta se desilo (golovi, asistencije, bonus), dvoboj sa rivalom iz lige, osvježavanje svake minute dok traje kolo.
- **Rival radar:** šansa da pobijediš rivala (kolo „odigrano” 2.500 puta), njegov vjerovatni kapiten, sezona jedan na jedan, savjet kako ga prestići i razlike u timovima.
- **Liga:** tabela, dvoboj kapitena i najbolji rezultati kola.

**Ti**
- **Karijera:** nivo i XP menadžera, najbolje kolo, brojač žaljenja (kapiten i klupa), kalendar sezone, značke i slika sezone za story.
- **Vodič:** osnovna pravila FPL-a.

**Novo: lige, kapiteni, izgled**
- Sve tvoje klasične lige (privatne, pa javne): u Ligi, Rivalu i Uživo prvo biraš ligu, pa rivala iz nje. Izbor se pamti. Kod velikih javnih liga se prikazuje prvih 50 i tvoje mjesto.
- Kapitenski pogoci (ekran Kapiten): pogodak je kapiten sa 6+ bodova (12+ sa duplim). Broj pogodaka, koliko puta je kapiten bio najbolji u timu, bodovi od kapitena, koliko je ostalo na stolu, najduži niz i kartica za svako kolo. U Ligi tabela pogodaka za članove lige (zadnja 4 kola).
- Vlastiti padajući meniji i prijedlozi umjesto sistemskih (`public/js/dd.js`), sa tastaturom i čitačem ekrana.
- Kompaktniji transferi (jedan red po transferu), igrači na terenu se suze kad ih je 5 u redu.

**Novo: Zanimljivosti kola** (meni Kolo)
- Rekordi igrača protiv protivnika iz sljedećeg kola: utakmice, golovi, asistencije i bodovi po utakmici u Premier ligi od sezone 2016/17.
- Izdvojeno: najviše golova, najviše asistencija, najviše bodova po utakmici, igrač kojem protivnik „ne leži” i najbolji iz tvog tima.
- Za svaku utakmicu kola top 5 igrača svakog kluba, sa filterom po klubu, poziciji i najmanjem broju utakmica i sortiranjem.
- Podaci su u `public/data/h2h.json`, napravljeni iz javnog skupa FPL podataka po utakmicama (github.com/vaastav/Fantasy-Premier-League). Osvježavanje jednom po kolu: `npm run h2h`, pa commit i objava.

**Novo u 0.5: SquadJury**
- SquadJury je spojen sa Managerom kao dodatak (`/jury`), u istim bojama i fontovima, sa linkom „Manager” nazad i karticom na Pregledu.
- Jedan Worker, jedna objava; oba dijela čitaju pravi FPL API.

**Novo u 0.4: izgled kao FPL**
- Igrači na terenu kao u FPL-u: dres, ime na bijeloj traci, ispod protivnik i bodovi. Golmani nose drugačiji dres, klubovi imaju svoje boje i pruge (bez grbova i pravih dresova).
- Uživo izgleda kao FPL stranica Points: bodovi kola u sredini, prosjek, najviše, rang kola i transferi, a na terenu bodovi svakog igrača.
- Cijene u funtama (£8,0m), protivnici kao „BHA (D)” i „LIV (G)”, oznake upitnih igrača u FPL bojama (75%, 50%, 25%, ne igra).
- Traka sa rokom za transfere na vrhu ekrana i pregled čipova (Wildcard, Free Hit, Bench Boost, Triple Captain).

**Novo u 0.3**
- **Planer postave** na ekranu Moj tim: klikneš igrača pa drugog da ih zamijeniš (provjerava FPL pravila za formaciju), biraš kapitena i vice kapitena, predviđeni bodovi se odmah preračunaju. Plan se čuva u pregledniku.
- **Pretraga** (Ctrl+K ili ⌘K): bilo koji igrač, klub ili ekran.
- **Poređenje igrača** u kartici igrača, sa boljom vrijednošću u svakom redu označenom zeleno.
- **Tržište igrača** na ekranu Transferi: filter po poziciji, cijeni i imenu, sortiranje, protivnici za 3 kola. Prijedlozi transfera za 1, 3 ili 5 kola.
- **Grafikon bodova** sa detaljima kola (rang, transferi, klupa) na prelaz ili fokus.
- **Brže učitavanje**: tim, historija i zadnje kolo u jednom zahtjevu, podaci se počnu preuzimati prije ostatka aplikacije, a ekrani se učitavaju unaprijed kad pređeš preko menija.

Klik na bilo kojeg igrača otvara karticu sa statistikom, narednih 5 protivnika sa predviđenim bodovima i bodovima po kolima. Aplikacija se može instalirati na mobitel (PWA).

Predviđeni bodovi su procjena (forma, prosjek bodova, minutaža, težina protivnika, domaći teren i FPL-ova `ep_next` kad postoji), a ne sigurna brojka.

## Jezik

Aplikacija je na engleskom (zadano) i bosanskom. Izbor (EN/BS) je na početnom ekranu, u bočnom meniju, u meniju "Više" na mobitelu i u SquadJury postavkama (Ja). Pamti se u pregledniku (`sj-lang`) i važi za oba dijela. Tekstovi FPL dijela su u kodu kao `tr(bosanski, engleski)` (public/js/i18n.js), a SquadJury tekstovi u public/jury/js/i18n.js i i18n-bs.js.

## SquadJury (dodatak)

SquadJury je dio aplikacije, na adresi `/jury` i u meniju pod „Zajednica”. Korisnik učita sliku svog tima iz FPL aplikacije (preglednik sam pročita svih 15 igrača), a zajednica ga ocjenjuje od 1 do 10 do roka. Ima tabelu najboljih timova, duele, privatne lige sa H2H, Plan B, scout bodove, značke, slike za dijeljenje i widget za ugradnju. Prijava je preko Googlea ili linka na email. SquadJury je na engleskom i u istim bojama kao Manager.

## Kako radi

| Dio | Gdje |
| :-- | :-- |
| Manager (ekrani, model predviđanja) | `public/` (`#/pregled`, `#/tim`, ...), `public/js/model.js` |
| Manager API (prosljeđuje FPL) | `src/worker.js`: `/api/bootstrap`, `/api/fixtures`, `/api/team/:id`, `/api/entry/...`, `/api/live/:gw`, `/api/league/:id`, `/api/element/:id` |
| SquadJury stranice | `public/jury/` (`/jury`, `/jury/leaderboard`, `/jury/post`, `/jury/squad`, `/jury/me`) |
| SquadJury API, baza i cron | `src/jury/` (ostale `/api/*` rute), D1 baza (`migrations/`), R2 za slike, linkovi `/t/`, `/r/`, `/l/`, `/embed/` |

Jedan Cloudflare Worker služi sve. Worker prosljeđuje javni FPL API (koji ne dozvoljava pozive iz preglednika), kešira odgovore i smanjuje velike odgovore na polja koja aplikacija koristi.

**Podaci uživo:** u `wrangler.jsonc` je `FPL_SOURCE = "live"`, pa objavljena verzija i Manager i SquadJury čitaju pravi FPL API (fantasy.premierleague.com). Lokalno (`npm run dev`) se koristi `FPL_SOURCE=snapshot`: pravi igrači, klubovi i raspored sezone 2026/27, a bodovi i timovi Managera su izmišljeni (`src/lib/demo.js`). FPL ponekad blokira zahtjeve sa Cloudflarea; tada SquadJury bodove može poslati sa tvog računara (`npm run points`, vidi niže).

## Lokalno

```bash
npm install
npm run db:migrate   # lokalna baza za SquadJury
npm run seed         # primjer: 30 izmišljenih ocjenjivača i timova (označeni kao primjer)
npm run dev          # http://localhost:8790 (Manager), http://localhost:8790/jury (SquadJury)
npm test             # Manager i SquadJury unit testovi
npm run test:api     # SquadJury API testovi na privremenoj bazi
```

Lokalno je uključena prijava za razvoj (bez Google računa).

## Objava

Aplikacija ide na postojeći SquadJury Worker (`"name": "squadjury"` u `wrangler.jsonc`): ista D1 baza, R2 spremište, tajne i domena. Manager je na `/`, SquadJury na `/jury`, a stare adrese (`/leaderboard`, `/post`, `/me`, `/login`, ...) se same preusmjere na `/jury/...`. Linkovi za dijeljenje (`/t/`, `/r/`, `/l/`, `/embed/`) ostaju isti.

```bash
npx wrangler login
npm install
npm run db:migrate:remote   # nema novih migracija, ali ne smeta
npm run deploy
```

Tajne (`ADMIN_EMAILS`, `ADMIN_TOKEN`, `RESEND_API_KEY`) i Google prijava ostaju kako su postavljene za SquadJury. Ako aplikaciju staviš na novu domenu, u Google Cloudu kod OAuth klijenta dodaj tu domenu pod **Authorised JavaScript origins** i `https://NOVA-DOMENA/api/auth/google/redirect` pod **Authorised redirect URIs**.

**Bodovi kad FPL blokira Worker** (PowerShell):

```powershell
$env:BASE="https://TVOJA-DOMENA"; $env:ADMIN_TOKEN="isti token"; npm run points -- --gw 9
```

## Sljedeće

- Provjera sa pravim FPL API-jem poslije objave (iz razvojnog okruženja FPL nije dostupan, pa je sve testirano na snimku sezone)
- SquadJury na bosanskom (tekstovi su u `public/jury/js/i18n.js`, dodaje se jedan objekat)
- Slike za dijeljenje iz SquadJuryja u bojama Managera
- „Pitaj ekipu” glasanje preko WhatsAppa i Vibera
- Poređenje sa timovima iz top 10.000
- Planer čipova za više kola
- Obavijesti za golove i rok za transfere

Nezvanična aplikacija. Nije povezana sa Premier League ni Fantasy Premier League.
