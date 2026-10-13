// Static pages: How it works, Rules, Privacy and the 404 page.

import { t } from '../i18n.js';
import { html } from '../ui.js';

const PAGES = {
  how: () => html`<div class="prose">
    <h1 class="title">${t('page.how')}</h1>
    <p class="sub">Post your squad. The jury decides.</p>
    <button class="btn" data-intro>${t('intro.again')}</button>
    <h2>1. Post your squad</h2>
    <p>Sign in with Google, then upload a screenshot of the <strong>Pick Team</strong> screen from the official FPL app. SquadJury reads your 15 players, captain and vice captain right in your browser. Check them, fix anything we missed and send your squad to the jury.</p>
    <h2>2. Judge other squads</h2>
    <p>Squads appear one at a time. Tap how much you like the squad, from 1 to 10, and the next one comes up. There is no right answer: love the differentials, hate the template, think the captain is a gamble? Your call, that is what a jury is for. You see the jury average only after you give your own verdict, and nobody ever sees who gave which verdict.</p>
    <h2>3. Climb the leaderboard</h2>
    <p>Verdicts stay open until the FPL deadline of the gameweek. At the deadline the gameweek locks and the final top 10 is saved on the leaderboard.</p>
    <h2>4. See the real points</h2>
    <p>When the gameweek is over, SquadJury adds up the real FPL points of every squad: the starting XI, the captain doubled and automatic substitutions from the bench. Then you see if the jury got it right. Add your <strong>FPL team ID</strong> in your profile and your exact points from FPL are used, with transfer hits and chips.</p>
    <h2>Private leagues</h2>
    <p>Make a league for your friends, your office or your mini league, and share its link or 6 character code. Everyone in it gets their own table every gameweek and for the season. The verdicts are the same as on the main leaderboard, so nobody can boost a friend just inside the league.</p>
    <h2>Share it</h2>
    <p>Every squad has its own link. Send it to your mini league, or post the square image of your squad on X with one tap.</p>
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
    </ul>
    <h2>The leaderboard</h2>
    <p>A squad needs <strong>at least 5 verdicts</strong>, and its owner needs to judge <strong>at least 5 other squads</strong> that gameweek (or every other squad, while there are fewer), to be ranked.</p>
    <p><strong>How the rank is worked out:</strong> more verdicts make a score more reliable, so a squad with only a few verdicts needs high marks from more people to reach the top. Technically, each average is blended with the gameweek average as if it had 5 extra votes at that average. The leaderboard shows the real average.</p>
    <h2>Fair play</h2>
    <ul>
      <li>Accounts that only ever give 1 or 10 count for half.</li>
      <li>Verdicts are rate limited, and squads reported 3 times are hidden until reviewed.</li>
      <li>Accounts that cheat are banned.</li>
    </ul>
  </div>`,
  privacy: () => html`<div class="prose">
    <h1 class="title">${t('page.privacy')}</h1>
    <p>SquadJury keeps as little as it can.</p>
    <h2>What we store</h2>
    <ul>
      <li><strong>Account:</strong> your Google account id and email (to sign you in, never shown to anyone), your nickname and the optional X username you add.</li>
      <li><strong>Squads:</strong> the players you post and your screenshot. Screenshots are deleted two gameweeks later, unless the squad finished in the top 10.</li>
      <li><strong>Verdicts:</strong> the scores you give. Owners only see averages and totals.</li>
      <li><strong>Technical:</strong> a session cookie that keeps you signed in for 90 days, and short lived counters used to stop spam.</li>
    </ul>
    <h2>What we never do</h2>
    <p>No ads, no tracking scripts and no selling of data. Screenshots are read in your browser; only the image you post is uploaded.</p>
    <h2>Delete your data</h2>
    <p>Go to <a href="/me">Me</a> and choose <strong>Delete my account</strong>. Your account, squads, screenshots and verdicts are removed straight away.</p>
    <p>${t('footer.fan')}</p>
  </div>`,
  404: () => html`<div class="empty"><span class="ycard"></span>
    <h1 class="title" style="margin-bottom:8px">${t('page.notFound')}</h1><p>${t('page.notFoundText')}</p>
    <a class="btn btn-go" href="/">${t('page.home')}</a></div>`,
};

export function mount(el, which) {
  const page = PAGES[which] || PAGES[404];
  el.innerHTML = page().s;
  el.querySelector('[data-intro]')?.addEventListener('click', () => import('../intro.js').then((m) => m.showIntro({ force: true })));
  document.title = `${which === '404' ? t('page.notFound') : t(`page.${which}`)} | SquadJury`;
}

