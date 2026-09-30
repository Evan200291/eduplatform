/* Learner pages (10) — the full early-years treatment. Wording is copied from the real screens. */
const G = 'Learner';

/* 1. Home ------------------------------------------------------------- */
reg({ id: 'home', group: G, title: 'Home', route: '/learn', mode: 'learner', states: ['Home', 'New badge', 'Welcome tour'],
  render: (st) => {
    const tile = (e, t, d, tint, edge) => `<div class="card press" style="background:${tint};border-color:${edge};box-shadow:0 var(--edge) 0 ${edge};display:flex;flex-direction:column;gap:8px;padding:16px">
        <div style="font-size:46px;line-height:1">${e}</div><h3>${t}</h3><p style="font-size:.85em;font-weight:700;opacity:.8">${d}</p></div>`;
    const body = `
      <div class="row" style="align-items:flex-end">${mascot(st === 'New badge' ? 'cheer' : 'happy', 104)}
        <div class="bubble grow"><b style="font-family:var(--font-display);font-size:1.15em">Hello, Amara!</b><br><span class="muted">Pick something to do.</span></div>${speaker('Hello Amara! Pick something to do.')}</div>
      ${st === 'New badge' ? card(`<div class="row"><span style="font-size:44px">🏅</span><div class="grow"><p class="eyebrow">You earned a new badge!</p><h3>Fraction Explorer</h3></div>${btn('Got it', 'sun sm')}</div>` + confetti(14), 'tint-sun pop', 'style="position:relative;overflow:hidden"') : ''}
      ${card(`<div class="row"><div class="chip-ico" style="--tint:#fff">▶️</div><div class="grow"><p class="eyebrow" style="color:var(--c-good-ink)">Next up</p><h2>Halves and quarters</h2></div></div>${btn('Continue', 'big block')}`, 'tint-good')}
      <div class="grid-2">
        ${card('<div class="kpi"><span class="eyebrow">🔥 Day streak</span><b style="color:var(--c-fire-edge)">3 <small style="font-size:.5em">days</small></b></div>', 'tint-fire')}
        ${card('<div class="kpi"><span class="eyebrow">⭐ Points</span><b style="color:#a67c00">120</b></div>', 'tint-sun')}
        ${card('<div class="kpi"><span class="eyebrow">📝 Assignments</span><b>2</b></div>', 'tint-blue')}
        ${card('<div class="kpi"><span class="eyebrow">💬 Messages</span><b>1</b><span class="muted" style="font-size:.85em">needs a look</span></div>', 'tint-mint')}
      </div>
      <h2>Where to go</h2>
      <div class="grid-2">
        ${tile('📚', 'Learn', 'Your next activities.', 'var(--c-secondary-soft)', '#a9dcf6')}
        ${tile('🚩', 'Missions', 'Challenges to finish.', 'var(--c-grape-soft)', '#cfc0f5')}
        ${tile('🦉', 'Your buddy', 'Ask for a hint.', 'var(--c-berry-soft)', '#f6b4d6')}
        ${tile('📈', 'My progress', 'What you have learned.', 'var(--c-primary-soft)', '#b9e58c')}
        ${tile('🏆', 'Top scores', 'How your class is doing.', 'var(--c-sun-soft)', '#f5dd84')}
        ${tile('🙂', 'My profile', 'Your badges, points and buddy.', 'var(--c-fire-soft)', '#f7c88b')}
      </div>`;
    const tour = st === 'Welcome tour' ? modal('Welcome to Midas!', `<div class="center stack">${mascot('cheer', 130)}<p>This is your learning space. Let's take a quick look around — it only takes a minute, and you can always come back to this tour from your profile.</p><div class="steps"><i class="now"></i><i></i><i></i><i></i><i></i></div></div>`, `${btn('Skip', 'ghost')}${btn('Next', 'blue')}`) : '';
    return learnerFrame('home', body) + tour;
  } });

/* 2. Learn (Activities) ------------------------------------------------ */
reg({ id: 'learn', group: G, title: 'Learn', route: '/learn/activities', mode: 'learner', states: ['Path', 'Lesson', 'Empty'],
  render: (st) => {
    const node = (e, cls = '', off = 0, tip = '', stars = 0, n = '') => `<div style="transform:translateX(${off}px);position:relative"><button class="node ${cls}" aria-label="Step ${n}">${tip ? `<span class="start-tip">${tip}</span>` : ''}${e}${stars ? `<span class="stars">${'⭐'.repeat(stars)}</span>` : ''}</button></div>`;
    if (st === 'Empty') return learnerFrame('learn', `<h1>Learn</h1>${empty(mascot('sleepy', 130), 'Your subjects are on their way', 'Ask your teacher to add you to a class, and your activities will show up right here.')}`);
    const body = `
      <div><h1>Learn</h1><p class="muted">Your lessons and activities, in order.</p></div>
      ${select(['Maths', 'Reading', 'Science'])}
      <div class="path-unit" style="background:var(--c-primary);box-shadow:0 5px 0 var(--c-primary-edge)"><div><small style="opacity:.85">MATHS · 3 of 8 steps done</small><div style="font-size:1.25em">Fractions</div></div><div style="font-size:1.6em">38%</div></div>
      ${bar(38, '', 'Your path')}
      <div class="path">
        ${node('✅', '', 0, '', 3, 1)}${node('✅', '', -46, '', 2, 2)}${node('✅', '', 0, '', 3, 3)}
        ${node('▶️', 'now', 46, 'Start', 0, 4)}
        ${node('📖', 'locked', 0, '', 0, 5)}${node('🎯', 'locked', -46, '', 0, 6)}${node('🧩', 'locked', 0, '', 0, 7)}${node('🏆', 'locked', 46, '', 0, 8)}
      </div>`;
    const lesson = st === 'Lesson' ? modal('Halves and quarters', `<div class="row wrap">${tag('Lesson', 'blue')}${tag('about 6 min')}</div><div class="card tint-sun flat"><p><b>Cut a pizza in 2 equal parts and each piece is a half.</b> Cut it in 4 equal parts and each piece is a quarter.</p></div><div class="card tint-mint flat"><h3>See it</h3><div style="font-size:54px;text-align:center">🍕 ➗ 🍕</div></div>`, `${btn('🚩 Report a problem', 'ghost sm')}${btn('Close', 'white')}${btn('Mark as done', '')}`) : '';
    return learnerFrame('learn', body) + lesson;
  } });

/* 3. Activity player --------------------------------------------------- */
reg({ id: 'player', group: G, title: 'Activity player', route: '/learn/activities/:id', mode: 'learner',
  states: ['Ready', 'Question', 'Correct', 'Not quite', 'Matching', 'True / False', 'Sorting', 'Read', 'Off-screen task', 'Finished', 'Result'],
  render: (st) => {
    const top = (n, total = 5) => `<div class="row" style="padding:14px 16px;gap:12px"><button class="close-x" aria-label="Stop for now">×</button><div class="grow steps">${Array.from({ length: total }, (_, i) => `<i class="${i < n ? 'done' : i === n ? 'now' : ''}"></i>`).join('')}</div><span class="stat-pill blue">⏱ 4:12</span></div>`;
    const wrap = (inner, foot = '') => `<div class="screen" style="padding-top:0">${inner}</div>${foot}`;
    const check = (label = 'Check my answer', dis = false) => `<div style="padding:16px;border-top:2px solid var(--c-line);background:#fff">${btn(label, `big block ${dis ? 'locked' : ''}`)}</div>`;
    const hint = `<div class="row" style="margin-top:4px">${mascot('think', 64, { bob: false })}${btn('Need a clue?', 'white sm')}</div>`;
    const q = `<div class="row"><div class="grow q-title">Which shape shows a half?</div>${speaker('Which shape shows a half?')}</div>`;
    const abcd = (cls = ['', '', '', '']) => `<div class="opt-grid">${[['🍕', 'Pizza cut in 2'], ['🍰', 'Cake cut in 4'], ['🍪', 'Cookie, whole'], ['🥧', 'Pie cut in 3']].map(([e, t], i) => `<button class="opt ${cls[i]}"><span class="big-em">${e}</span>${t}</button>`).join('')}</div>`;
    const fb = (good, big, small) => `<div class="feedback ${good ? 'good' : 'oops'}"><div class="row">${mascot(good ? 'cheer' : 'oops', 64, { bob: false })}<div class="grow"><h3>${big}</h3><p style="font-weight:700;font-size:.9em">${small}</p></div></div>${btn(good ? 'Next question' : 'Next question', 'block big ' + (good ? '' : 'fire'))}</div>`;
    switch (st) {
      case 'Ready': return learnerFrame('learn', `<div class="center stack" style="margin-top:20px">${mascot('happy', 150)}<h1>Ready when you are</h1><p class="muted">This one has a time limit of 5 minutes. The clock starts when you press Start.</p>${btn('Start', 'big block')}</div>`, { noNav: true });
      case 'Question': return top(1) + wrap(`${q}${abcd()}${hint}`, check('Check my answer', true));
      case 'Correct': return top(2) + wrap(`${q}${abcd(['right', '', '', ''])}`) + fb(true, 'Brilliant, you got it!', 'A half is 1 of 2 equal parts.') + confetti(10);
      case 'Not quite': return top(1) + wrap(`${q}${abcd(['', 'wrong', '', ''])}<div class="card tint-fire flat"><b>Here is how to think about it:</b><ol style="margin:6px 0 0;padding-left:20px"><li>A half means 2 equal parts.</li><li>Count the parts in each picture.</li></ol><p class="muted" style="margin-top:6px">If it still feels tricky, ask your teacher. Tricky questions are how we learn.</p></div>`) + fb(false, 'Not quite, but good try!', 'Nothing counts against you.');
      case 'Matching': return top(2) + wrap(`<div class="row"><div class="grow q-title">Match each shape to its name</div>${speaker('Match each shape to its name')}</div><p class="muted">Tap an item on the left, then tap its match on the right.</p>
        <div class="grid-2"><div class="stack" style="gap:10px"><button class="opt right">🔴 Circle → <b>round</b></button><button class="opt picked">🔺 Triangle</button><button class="opt">⬛ Square</button></div>
        <div class="stack" style="gap:10px"><button class="opt">4 sides</button><button class="opt">3 sides</button><button class="opt" style="opacity:.4">round</button></div></div>`, check('Check my answer', true));
      case 'True / False': return top(3) + wrap(`<div class="row"><div class="grow q-title">A quarter is bigger than a half.</div>${speaker('A quarter is bigger than a half.')}</div><div style="font-size:70px;text-align:center">🍕</div><div class="grid-2"><button class="opt" style="justify-content:center;min-height:100px"><span class="big-em">👍</span> True</button><button class="opt picked" style="justify-content:center;min-height:100px"><span class="big-em">👎</span> False</button></div>`, check());
      case 'Sorting': return top(3) + wrap(`<div class="row"><div class="grow q-title">Put these in order, smallest first</div>${speaker('Put these in order, smallest first')}</div>${['1 quarter', '1 half', '1 whole'].map((t, i) => `<div class="opt"><b class="muted">${i + 1}.</b><span class="grow">${t}</span><span class="row" style="gap:6px"><button class="btn sm white round" aria-label="Move up">↑</button><button class="btn sm white round" aria-label="Move down">↓</button></span></div>`).join('')}`, check());
      case 'Read': return top(0, 3) + wrap(`<div class="card tint-blue"><div class="row"><span style="font-size:38px">📖</span><div class="grow"><p class="eyebrow">Have a read</p><h2>Sharing fairly</h2></div>${speaker('Sharing fairly. When we share a cake, every piece should be the same size.')}</div></div><p style="font-size:1.1em">When we share a cake, every piece should be the <b>same size</b>. Two equal pieces? Each one is a <b>half</b>.</p><div style="font-size:70px;text-align:center">🎂</div>`, check('Got it'));
      case 'Off-screen task': return top(0, 3) + wrap(`<div class="card tint-grape"><h2>Something to do away from the screen</h2><p style="margin-top:8px">Fold a piece of paper in half, then in half again. How many parts can you count?</p><div class="row wrap" style="margin-top:10px">${tag('Off-screen task', 'grape')}${tag('Can be done with others', 'blue')}</div></div><p class="muted">This is something you do away from the app — bring a photo or a short note to show your teacher. Ask your teacher to check it off once you've finished, or let us know here when you're done.</p>`, check('I did this'));
      case 'Finished': return learnerFrame('learn', `<div class="center stack" style="margin-top:16px;position:relative">${mascot('cheer', 160)}<h1>Nice work — that's everything.</h1>${btn('See how it went', 'big block')}${confetti(24)}</div>`, { noNav: true });
      default: return learnerFrame('learn', `<div class="center stack" style="margin-top:8px;position:relative">${mascot('cheer', 140)}<div class="muted eyebrow">questions correct</div><div style="font-family:var(--font-display);font-weight:900;font-size:78px;line-height:1;color:var(--c-primary)">4 <small style="font-size:.4em;color:var(--c-ink-muted)">of 5</small></div><div>${'⭐'.repeat(3)}</div><p style="font-size:1.1em"><b>Great work</b> — that shows real progress.</p><p class="muted">Handed in to your teacher.</p>${btn('Continue learning', 'big block')}${confetti(24)}</div>`, { noNav: true });
    }
  } });

/* 4. Screening --------------------------------------------------------- */
reg({ id: 'screening', group: G, title: 'Getting started (screening)', route: '/learn/screening', mode: 'learner', states: ['Intro', 'Done'],
  render: (st) => st === 'Done'
    ? learnerFrame('learn', `<div class="center stack" style="margin-top:16px;position:relative">${mascot('cheer', 150)}<h1>All done — thank you!</h1><p>Your teacher will look this over and set up your learning path.</p>${btn('Go to my learning', 'big block')}${confetti(20)}</div>`, { noNav: true })
    : learnerFrame('learn', `<div><h1>Getting started</h1><p class="muted">A short check so we know where to begin.</p></div>${card(`<div class="stack"><div class="row">${mascot('happy', 90)}<div class="stack" style="gap:6px">${tag('Not scored', 'blue')}<h2>There's no pass or fail here</h2></div></div><p>We'll ask a few questions to see where to start. Just do your best — and it's fine to say you don't know.</p>${btn("Let's go", 'big block')}</div>`, 'tint-blue')}`) });

/* 5. Missions ---------------------------------------------------------- */
reg({ id: 'missions', group: G, title: 'Missions', route: '/learn/missions', mode: 'learner', states: ['List', 'Empty'],
  render: (st) => {
    if (st === 'Empty') return learnerFrame('missions', `<h1>Missions</h1>${empty(mascot('sleepy', 130), 'No missions right now', 'New challenges land here when your teacher sets them up — keep learning in the meantime!')}`);
    const m = (e, t, s, tone, d, pct, goal, pts, tint) => card(`<div class="row"><span class="chip-ico" style="--tint:#fff">${e}</span><div class="grow"><h3>${t}</h3></div>${tag(s, tone)}</div><p style="margin:8px 0">${d}</p>${bar(pct, pct === 100 ? '' : 'blue', goal)}<p class="muted" style="margin-top:8px;font-weight:800">⭐ Worth ${pts} points</p>`, tint);
    return learnerFrame('missions', `<div><h1>Missions</h1><p class="muted">Short challenges to finish this week.</p></div>
      ${m('🔢', 'Count to 100', 'In progress', 'blue', 'Do 5 counting activities.', 60, '3 of 5 activities', 50, 'tint-blue')}
      ${m('📚', 'Reading streak', 'In progress', 'blue', 'Read on 3 different days.', 33, '1 of 3 days', 30, 'tint-grape')}
      ${m('🍕', 'Fraction fun', 'Complete', 'good', 'Finish the fractions path.', 100, '8 of 8 steps', 80, 'tint-good')}
      ${m('🎯', 'Sharp shooter', 'Not started', '', 'Get 5 answers right in a row.', 0, '0 of 5', 25, '')}`);
  } });

/* 6. Buddy (companion) ------------------------------------------------- */
reg({ id: 'buddy', group: G, title: 'Your buddy', route: '/learn/companion', mode: 'learner', states: ['Buddy', 'Adopt', 'Rename'],
  render: (st) => {
    if (st === 'Adopt') return learnerFrame('buddy', `<div><h1>Your buddy</h1><p class="muted">They grow as you learn.</p></div>${card(`<div class="stack"><div class="center">${mascot('happy', 130)}</div><h2 class="center">Pick a friend to learn alongside you</h2><p class="muted center">They grow every time you finish something.</p><div class="grid-3">${[['🦊', 'Ember Fox'], ['🦦', 'River Otter'], ['🐇', 'Meadow Hare'], ['🦉', 'Star Owl'], ['🐢', 'Cloud Turtle'], ['🦡', 'Pebble Badger']].map(([e, n], i) => `<button class="opt" style="flex-direction:column;min-height:96px;padding:8px;font-size:.85em;${i === 3 ? 'border-color:var(--c-secondary);background:var(--c-secondary-soft)' : ''}"><span style="font-size:40px">${e}</span>${n}</button>`).join('')}</div>${field('Give them a name', input('', 'Pip'), 'At least 2 letters.')}${btn('Adopt', 'big block')}</div>`, 'tint-sun')}`);
    const shop = (e, n, p, act, cls = '') => `<div class="card flat stack" style="gap:8px;align-items:center;padding:14px"><span style="font-size:44px">${e}</span><b>${n}</b><span class="tag sun">⭐ ${p} pts</span>${btn(act, `sm ${cls}`)}</div>`;
    const body = `<div><h1>Your buddy</h1><p class="muted">They grow as you learn.</p></div>
      ${card(`<div class="center stack" style="gap:6px">${mascot('happy', 150)}<div class="row" style="justify-content:center"><h2>Pip</h2>${btn('Rename', 'ghost sm')}</div><p class="muted">Star Owl · Hatchling</p>${tag('Feeling cheerful', 'good')}</div><div style="margin:12px 0">${bar(64, 'sun', 'Growing')}</div><div class="grid-3">${btn('👋<br>Say hello', 'blue', 'style="flex-direction:column;padding:10px;font-size:.7em"')}${btn('🎾<br>Play', 'fire', 'style="flex-direction:column;padding:10px;font-size:.7em"')}${btn('🎉<br>Cheer them on', 'berry', 'style="flex-direction:column;padding:10px;font-size:.7em"')}</div>`, 'tint-good')}
      ${card(cardHead('Buddy diary', '', 'What has happened lately.') + `<div class="list-row">${chip('🌱', 'var(--c-good-soft)', 'sm')}<div class="grow"><b>Pip grew a little!</b><div class="muted" style="font-size:.85em">2 hours ago</div></div>${tag('New', 'blue')}</div><div class="list-row">${chip('🎩', 'var(--c-sun-soft)', 'sm')}<div class="grow"><b>New hat unlocked</b><div class="muted" style="font-size:.85em">Yesterday</div></div></div>`)}
      ${card(cardHead('Reward shop', '', 'Spend your points on something fun.') + `<div class="grid-2">${shop('🎩', 'Party hat', 40, 'Wear it')}${shop('🕶️', 'Cool shades', 60, 'Unlock')}${shop('🧣', 'Winter scarf', 90, 'Unlock', 'locked')}${shop('👑', 'Golden crown', 150, 'Unlock', 'locked')}</div>`)}`;
    return learnerFrame('buddy', body) + (st === 'Rename' ? modal('Give your buddy a new name', field('Name', input('', 'Pip')), `${btn('Cancel', 'white')}${btn('Save')}`) : '');
  } });

/* 7. Top scores -------------------------------------------------------- */
reg({ id: 'scores', group: G, title: 'Top scores', route: '/learn/leaderboard', mode: 'learner', states: ['Board', 'Empty'],
  render: (st) => st === 'Empty'
    ? learnerFrame('scores', `<h1>Top scores</h1>${empty(mascot('sleepy', 130), 'No leaderboards yet', "Your school hasn't turned these on — your points still count towards badges and missions.")}`)
    : learnerFrame('scores', `<div><h1>Top scores</h1><p class="muted">How your class is doing.</p></div>
      <div class="podium" style="margin-top:6px"><div><div class="avatar" style="margin:0 auto 6px;background:var(--c-berry);box-shadow:0 3px 0 var(--c-berry-edge)">MK</div><b>Mia</b><div class="step" style="height:84px;background:#b8c4dc;margin-top:6px">2</div></div>
        <div><div style="font-size:30px">👑</div><div class="avatar" style="margin:0 auto 6px;background:var(--c-sun);color:#5b4300;box-shadow:0 3px 0 var(--c-sun-edge)">LO</div><b>Leo</b><div class="step" style="height:116px;background:var(--c-sun);margin-top:6px">1</div></div>
        <div><div class="avatar" style="margin:0 auto 6px;background:var(--c-fire);box-shadow:0 3px 0 var(--c-fire-edge)">AO</div><b>Amara</b><div class="step" style="height:62px;background:var(--c-fire);margin-top:6px">3</div></div></div>
      ${card(cardHead('Class 3A', btn('Hide me', 'white sm')) + [[1, 'Leo', 210], [2, 'Mia', 188], [3, 'Amara', 120, 'me'], [4, 'Noah', 96], [5, 'Zoe', 88]].map(([r, n, p, me]) => `<div class="list-row ${me ? 'me' : ''}"><span class="rank">${r}</span><span class="avatar" style="width:36px;height:36px;font-size:12px">${n.slice(0, 2).toUpperCase()}</span><b class="grow">${n}${me ? ' (you)' : ''}</b>${r === 3 ? tag('↑ 2', 'good') : ''}<b class="tabular">${p} pts</b></div>`).join(''))}`) });

/* 8. My progress ------------------------------------------------------- */
reg({ id: 'progress', group: G, title: 'My progress', route: '/learn/progress', mode: 'learner', states: ['Progress', 'Empty'],
  render: (st) => {
    if (st === 'Empty') return learnerFrame('progress', `<h1>My progress</h1>${empty(mascot('happy', 130), 'Your first activity is waiting', 'Finish one and it will show up here — this page fills up fast.')}`);
    const stat = (e, n, l, t) => card(`<div class="kpi"><span style="font-size:30px">${e}</span><b>${n}</b><span class="muted" style="font-weight:800;font-size:.85em">${l}</span></div>`, t);
    const topic = (n, avg, done, tot, cls) => `<div class="stack" style="gap:6px"><div class="row" style="justify-content:space-between"><b>${n}</b>${tag(avg + '% average', 'good')}</div>${bar(Math.round(done / tot * 100), cls, `${done} of ${tot} activities`)}</div>`;
    const lvl = (n, t, tone) => `<div class="row" style="justify-content:space-between"><b>${n}</b>${tag(t, tone)}</div>`;
    return learnerFrame('progress', `<div><h1>My progress</h1><p class="muted">What you have learned so far.</p></div>
      <div class="grid-2">${stat('✅', 12, 'Activities completed', 'tint-good')}${stat('🎯', 18, 'Attempts', 'tint-blue')}${stat('⏱️', '95 min', 'Time learning', 'tint-fire')}${stat('🏅', 3, 'Badges earned', 'tint-sun')}</div>
      ${card(cardHead('By topic', '', 'How far through each topic you are.') + `<div class="stack">${topic('Counting', 92, 5, 5, '')}${topic('Fractions', 78, 3, 8, 'blue')}${topic('Shapes', 65, 1, 4, 'fire')}</div>`)}
      ${card(cardHead('Your mastery by topic', '', 'How well you know each topic right now.') + `<div class="stack">${lvl('Counting', "You've got this mastered!", 'good')}${lvl('Shapes', 'Getting really good at this', 'blue')}${lvl('Fractions', 'Building it up', 'sun')}${lvl('Time', 'Just getting started', 'oops')}${lvl('Money', 'Not started yet', '')}</div>`)}
      ${card(cardHead("What's next", '', "Work you've started or still need to hand in.") + `<div class="list-row">${chip('📝', 'var(--c-secondary-soft)', 'sm')}<div class="grow"><b>Fractions practice</b><div class="muted" style="font-size:.85em">Due tomorrow · about 10 min</div></div>${btn('Carry on', 'sm')}</div>`)}
      ${card(cardHead('Streaks', '', 'Keep them going!') + `<div class="grid-2"><div class="card flat tint-good center"><b style="font-size:34px;font-family:var(--font-display)">3</b><div>days · daily learning</div></div><div class="card flat tint-fire center"><b style="font-size:34px;font-family:var(--font-display)">1</b><div>day · homework on time<br><small>keep it alive today</small></div></div></div>`)}`);
  } });

/* 9. My profile -------------------------------------------------------- */
reg({ id: 'profile', group: G, title: 'My profile', route: '/learn/profile', mode: 'learner', states: ['Profile', 'Change name'],
  render: (st) => {
    const badge = (e, n, tone) => `<span class="tag ${tone}" style="padding:8px 14px;font-size:.9em">${e} ${n}</span>`;
    const body = `<div class="row" style="justify-content:space-between"><h1>My profile</h1>${btn('Replay the welcome tour', 'ghost sm')}</div>
      ${card(`<div class="row"><span class="avatar" style="width:72px;height:72px;font-size:26px">AO</span><div class="grow"><h2>Amara</h2><p class="muted">Northgate Academy</p></div>${btn('Change my name', 'white sm')}</div>`, 'tint-grape')}
      <div class="grid-2">${card('<div class="kpi"><b style="color:#a67c00">120</b><span class="muted" style="font-weight:800">total points earned</span></div>', 'tint-sun')}${card(`<div class="center stack" style="gap:4px">${mascot('happy', 70)}<p class="eyebrow">Your buddy</p><b>Pip</b><span class="muted">Hatchling</span>${btn('Visit', 'sm blue')}</div>`, 'tint-berry')}</div>
      ${card(cardHead("Where you're headed") + `<p>In Maths, you're on a path focused on this subject. <b>3 of 8 steps done so far.</b></p>`)}
      ${card(cardHead('Badges', '', 'Everything you have earned so far.') + `<div class="row wrap">${badge('🏅', 'Fraction Explorer', 'good')}${badge('🔥', 'Three-day streak', 'sun')}${badge('📚', 'Bookworm', 'blue')}</div>`)}
      ${card(cardHead('Badges to go for', '', 'What each one asks you to do.') + `<div class="list-row">${chip('🎯', 'var(--c-sunken)', 'sm')}<div class="grow"><b>Sharp shooter</b><div class="muted">Get 5 answers right in a row.</div></div></div>`)}
      ${card(cardHead('Where your points came from', '', 'Every point you have earned, and why.') + [['Finished an activity', '+10', '2 hours ago'], ['Handed in homework', '+20', 'Yesterday'], ['Earned a badge', '+30', '3 days ago']].map(([a, p, t]) => `<div class="list-row"><div class="grow"><b>${a}</b><div class="muted" style="font-size:.85em">${t}</div></div><b style="color:var(--c-good-ink)">${p}</b></div>`).join(''))}`;
    return learnerFrame('home', body) + (st === 'Change name' ? modal('Change my name', field('What should we call you?', input('', 'Amara'), 'This is the name other people see on leaderboards.'), `${btn('Cancel', 'white')}${btn('Save')}`) : '');
  } });

/* 10. Messages --------------------------------------------------------- */
reg({ id: 'messages', group: G, title: 'Messages', route: '/learn/notifications', mode: 'learner', states: ['List', 'Empty'],
  render: (st) => st === 'Empty'
    ? learnerFrame('home', `<h1>Messages</h1>${empty(mascot('sleepy', 130), 'No messages right now', 'When your teacher sends you something, it will appear here.')}`)
    : learnerFrame('home', `<div class="row" style="justify-content:space-between"><div><h1>Messages</h1><p class="muted">Notices from your school and your teacher.</p></div>${btn('Mark all read', 'white sm')}</div>
      ${card(`<div class="row" style="justify-content:space-between"><h3>Well done on your fractions!</h3>${tag('New', 'blue')}</div><p style="margin:6px 0">Miss Raman says: keep going, you're doing great.</p><div class="row wrap"><span class="muted">2 hours ago</span><span class="grow"></span>${btn('Mark read', 'white sm')}${btn('Clear', 'ghost sm')}</div>`, 'tint-blue')}
      ${card(`<div class="row" style="justify-content:space-between"><h3>Homework due tomorrow</h3>${tag('High', 'oops')}</div><p style="margin:6px 0">Fractions practice is due tomorrow.</p><div class="row wrap"><span class="muted">Yesterday</span><span class="grow"></span>${btn('Open my work', 'sm')}${btn('Clear', 'ghost sm')}</div>`)}`) });

/* 11. Sign-in (learner) -------------------------------------------------- */
reg({ id: 'login-student', group: 'Sign-in & account', title: 'Sign in — student', route: '/login', mode: 'learner-bare', states: ['Empty', 'Needs a code', 'With PIN'],
  render: (st) => authFrame(`<div class="center">${mascot('happy', 130)}<h1>Sign in</h1><p class="muted">Welcome back.</p></div>
    ${card(`<div class="stack">${seg(['I am a student', 'Teacher or staff'], 0)}${field('Your code *', input('', st === 'Needs a code' ? '' : 'AMA-0001', st === 'Needs a code' ? 'bad' : ''), 'Your teacher gives you this.', st === 'Needs a code' ? 'This is required.' : '')}${check('I also have a PIN', st === 'With PIN')}${st === 'With PIN' ? field('PIN *', input('', '••••')) : ''}${btn("Let's go", 'big block')}</div>`)}
    <p class="center muted">Midas Learning · Ask your teacher if you cannot get in</p>`) });
